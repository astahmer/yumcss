import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import type { PandwindMeta } from "../src/meta.ts";
import {
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	CodemodAdapterId,
	getProjectMigrationCommand,
	rewritePandaSource,
	validatePandaSource,
} from "../src/swap/index.ts";

describe("Panda migration pipeline", () => {
	test("exposes Panda as a replaceable project pipeline", () => {
		expect(PANDA_MIGRATION_PIPELINE.schema).toBe(PANDA_MIGRATION_PIPELINE_SCHEMA);
		expect(PANDA_MIGRATION_PIPELINE.stages.map((stage) => stage.id)).toEqual([
			"project-discovery",
			"theme-config",
			"source-scanning",
			"recipe-pattern-extraction",
			"semantic-conversion",
			"module-emission",
			"rewrite-application",
			"validation-reporting",
		]);
		expect(rewritePandaSource("const x = 1;", [{ start: 6, end: 7, text: "y" }])).toBe(
			"const y = 1;",
		);
		expect(validatePandaSource("stage.ts", "const x = 1;").valid).toBe(true);
		expect(validatePandaSource("stage.tsx", "const x = (<div>;").valid).toBe(false);
	});

	test("executes every Panda stage against a real project workspace", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-pipeline-"));
		try {
			writeFileSync(join(root, "Page.tsx"), 'export const page = css({ color: "red" });\n');
			const report = await PANDA_MIGRATION_PIPELINE.run({
				projectRoot: root,
				patterns: ["Page.tsx"],
				meta: { bridgeInverse: new Map() } as unknown as PandwindMeta,
				write: false,
				diff: false,
				skipMarker: "pandwind:pipeline-test",
			});
			expect(report.filesScanned).toBe(1);
			expect(report.notes.some((note) => note.includes("pipeline stages:"))).toBe(true);
			expect(report.notes.some((note) => note.includes("pipeline artifacts:"))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("routes the Panda project command through the project migration port", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-command-"));
		const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			mkdirSync(join(root, "src"), { recursive: true });
			mkdirSync(join(root, "styled-system"), { recursive: true });
			writeFileSync(join(root, "styled-system", "styles.css"), "/* Panda fixture stylesheet */\n");
			writeFileSync(
				join(root, "vite.config.ts"),
				'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n',
			);
			const file = join(root, "src", "Page.tsx");
			writeFileSync(
				file,
				'import "../styled-system/styles.css";\nexport const page = css({ color: "red" });\n',
			);
			const command = getProjectMigrationCommand(CodemodAdapterId.Panda);
			expect(command?.id).toBe(CodemodAdapterId.Panda);
			await command?.run({
				projectRoot: root,
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.Pandwind,
				reportFormat: "json",
				patterns: ["src/Page.tsx"],
				filePaths: [file],
				meta: { bridgeInverse: new Map() } as unknown as PandwindMeta,
				diff: false,
				report: true,
				write: true,
				skipMarker: "pandwind:command-test",
			});
			expect(readFileSync(file, "utf8")).toContain("css.class");
			expect(readFileSync(file, "utf8")).toContain('from "../pandwind/css"');
			expect(JSON.parse(output.mock.calls[0]?.join("") ?? "")).toMatchObject({
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.Pandwind,
				report: { filesScanned: 1, filesChanged: 1, cssCallsConverted: 1 },
			});
		} finally {
			output.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
