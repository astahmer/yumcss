import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createStudioCodemodEvaluator } from "./evaluator.ts";
import { createStudioServer } from "./server.ts";
import { createStudioSession } from "./session.ts";
import { createStudioWorkspace } from "./workspace.ts";
import { createInMemoryStudioUiProvider } from "./ui-provider.ts";

const ui = createInMemoryStudioUiProvider(
	"<!doctype html><html><body><h1>pandwind / studio</h1></body></html>",
);

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("studio integration", () => {
	test("evaluates a real adapter through the authenticated HTTP session", async () => {
		const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-studio-http-"));
		mkdirSync(join(root, "src"));
		const file = join(root, "src", "Card.tsx");
		writeFileSync(
			file,
			'import { css } from "@emotion/css";\nexport const card = css({ color: "red" });',
		);
		roots.push(root);

		const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
		const evaluator = createStudioCodemodEvaluator();
		const session = createStudioSession({ workspace, evaluation: evaluator, adapters: evaluator });
		const server = await createStudioServer({ session, token: "integration-token", ui });
		const origin = new URL(server.address.url).origin;
		const request = (path: string, body: unknown) =>
			fetch(`${origin}${path}?token=integration-token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		try {
			const opened = await request("/api/studio/open", { root, patterns: ["src/**/*"] });
			expect(opened.status).toBe(200);
			const targeted = await request("/api/studio/target", {
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
				import { createCss } from "pandwind/css";
				const css = createCss();

				export const card = css.class({ color: "red" });"
			`);

			const edited = await request("/api/studio/edit", {
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
