import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createMigrationPreviewCodemodEvaluator } from "./evaluator.ts";
import { createMigrationPreviewServer } from "./server.ts";
import { createMigrationPreviewSession } from "./session.ts";
import { createMigrationPreviewWorkspace } from "./workspace.ts";
import { createInMemoryMigrationPreviewUiProvider } from "./ui-provider.ts";

const ui = createInMemoryMigrationPreviewUiProvider(
	"<!doctype html><html><body><h1>pandwind / migration preview</h1></body></html>",
);

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("migration-preview integration", () => {
	test("evaluates a real adapter through the authenticated HTTP session", async () => {
		const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-migration-preview-http-"));
		mkdirSync(join(root, "src"));
		const file = join(root, "src", "Card.tsx");
		writeFileSync(
			file,
			'import { css } from "@emotion/css";\nexport const card = css({ color: "red" });',
		);
		roots.push(root);

		const workspace = createMigrationPreviewWorkspace({ watcher: { watch: () => () => undefined } });
		const evaluator = createMigrationPreviewCodemodEvaluator();
		const session = createMigrationPreviewSession({ workspace, evaluation: evaluator, adapters: evaluator });
		const server = await createMigrationPreviewServer({ session, token: "integration-token", ui });
		const origin = new URL(server.address.url).origin;
		const request = (path: string, body: unknown) =>
			fetch(`${origin}${path}?token=integration-token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		try {
			const opened = await request("/api/migration-preview/open", { root, patterns: ["src/**/*"] });
			expect(opened.status).toBe(200);
			const targeted = await request("/api/migration-preview/target", {
				source: "emotion",
				target: "css.class",
			});
			const first = (await targeted.json()) as {
				adapters?: { targets: readonly unknown[] };
				evaluation: {
					artifacts?: { targetCode?: string };
					diagnostics: readonly unknown[];
				};
			};
			expect(targeted.status).toBe(200);
			expect(first.adapters?.targets).toContainEqual({
				id: "css.class",
				label: "css.class",
				role: "target",
			});
			expect(first.evaluation.artifacts?.targetCode).toContain("css.class");
			expect(first.evaluation.diagnostics).toEqual([]);
			expect(first.evaluation.artifacts?.targetCode).toMatchInlineSnapshot(`
				"// src/Card.tsx
				import { createUnsafeCss } from "pandwind/unsafe/css";
				const css = createUnsafeCss();
				export const card = css.class({ color: "red" });"
			`);

			const edited = await request("/api/migration-preview/edit", {
				file: "src/Card.tsx",
				source: 'import { css } from "@emotion/css";\nexport const card = css({ color: "blue" });',
			});
			const second = (await edited.json()) as {
				evaluation: { artifacts?: { targetCode?: string }; diagnostics: readonly unknown[] };
			};
			expect(edited.status).toBe(200);
			expect(second.evaluation.artifacts?.targetCode).toContain('color: "blue"');
			expect(second.evaluation.diagnostics).toEqual([]);
			expect({
				status: edited.status,
				changedTarget: second.evaluation.artifacts?.targetCode?.includes('color: "blue"'),
				diagnostics: second.evaluation.diagnostics,
			}).toMatchInlineSnapshot(`
				{
				  "changedTarget": true,
				  "diagnostics": [],
				  "status": 200,
				}
			`);
		} finally {
			await server.close();
		}
	});
});
