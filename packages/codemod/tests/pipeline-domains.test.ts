import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import type { PandwindMeta } from "../src/meta.ts";
import {
	ADAPTER_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	createPandaMigrationPipeline,
	createPandaMigrationServices,
	createPandaMigrationStages,
	MIGRATION_PIPELINE_SCHEMA,
	rewritePandaSource,
	validatePandaSource,
} from "../src/swap/index.ts";

describe("migration pipeline domains", () => {
	test("keeps adapter migration orchestration behind one staged interface", () => {
		const result = ADAPTER_MIGRATION_PIPELINE.run(`const card = css({ color: "red" });`, {
			from: "emotion",
			to: "styled-components",
			file: "Card.tsx",
		});
		expect(ADAPTER_MIGRATION_PIPELINE.schema).toBe(MIGRATION_PIPELINE_SCHEMA);
		expect(result.converted).toBe(1);
	});

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

	test("allows a Panda stage service to be substituted without changing orchestration", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-pipeline-port-"));
		try {
			writeFileSync(join(root, "Page.tsx"), 'export const page = css({ color: "red" });\n');
			const defaults = createPandaMigrationServices();
			const discover = vi.fn(defaults.discover);
			const parseCalls = vi.fn(defaults.parseCalls);
			const pipeline = createPandaMigrationPipeline({
				services: { discover, parseCalls },
			});
			await pipeline.run({
				projectRoot: root,
				patterns: ["Page.tsx"],
				meta: { bridgeInverse: new Map() } as unknown as PandwindMeta,
				write: false,
				diff: false,
				skipMarker: "pandwind:port-test",
			});
			expect(discover).toHaveBeenCalledOnce();
			expect(parseCalls).toHaveBeenCalled();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("allows the complete Panda stage factory to be substituted", () => {
		const factory = { create: vi.fn(createPandaMigrationStages) };
		const pipeline = createPandaMigrationPipeline({ stageFactory: factory });
		expect(factory.create).toHaveBeenCalledOnce();
		expect(pipeline.stages.map((stage) => stage.id)).toEqual(
		PANDA_MIGRATION_PIPELINE.stages.map((stage) => stage.id),
		);
	});
});
