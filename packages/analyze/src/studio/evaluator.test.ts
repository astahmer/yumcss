import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { StudioEvaluationRequest } from "./contracts.ts";
import { createStudioCodemodEvaluator } from "./evaluator.ts";
import { createStudioWorkspace } from "./workspace.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("studio codemod evaluator", () => {
	test("exposes registered adapters for the Studio controls", async () => {
		const adapters = await createStudioCodemodEvaluator().list();

		expect(adapters.sources).toContainEqual({
			id: "emotion",
			label: "emotion",
			role: "both",
		});
		expect(adapters.targets).toContainEqual({
			id: "css.class",
			label: "css.class",
			role: "target",
		});
		expect({
			sourceCount: adapters.sources.length,
			targetCount: adapters.targets.length,
			firstTargets: adapters.targets.slice(0, 3),
			lastTargets: adapters.targets.slice(-3),
		}).toMatchInlineSnapshot(`
			{
			  "firstTargets": [
			    {
			      "id": "css.class",
			      "label": "css.class",
			      "role": "target",
			    },
			    {
			      "id": "dss",
			      "label": "dss",
			      "role": "target",
			    },
			    {
			      "id": "tw",
			      "label": "tw",
			      "role": "target",
			    },
			  ],
			  "lastTargets": [
			    {
			      "id": "react-native",
			      "label": "react-native",
			      "role": "both",
			    },
			    {
			      "id": "tokenami",
			      "label": "tokenami",
			      "role": "both",
			    },
			    {
			      "id": "unocss",
			      "label": "unocss",
			      "role": "both",
			    },
			  ],
			  "sourceCount": 26,
			  "targetCount": 29,
			}
		`);
	});

	test("detects a source adapter and returns the target source without writing files", async () => {
		const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-studio-evaluator-"));
		mkdirSync(join(root, "src"));
		const file = join(root, "src", "Card.tsx");
		writeFileSync(
			file,
			'import { css } from "@emotion/css";\nexport const card = css({ color: "red" });',
		);
		roots.push(root);

		const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
		const opened = await workspace.open({ root, patterns: ["src/**/*"] });
		const request: StudioEvaluationRequest = {
			workspace: opened,
			selection: null,
			target: { target: "css.class", source: "emotion" },
			theme: { scope: null },
		};
		const result = await createStudioCodemodEvaluator().evaluate(request);

		expect(result.artifacts?.targetCode).toContain("css.class");
		expect(result.artifacts?.sourceCode).toContain("@emotion/css");
		expect(result.tree?.roots).toHaveLength(1);
		const semantic = result.semantic as {
			migrations: Array<{ file: string; converted: number; residuals: number; outcomes: unknown }>;
		};
		semantic.migrations = semantic.migrations.map((migration) => ({
			...migration,
			file: migration.file.replace(root, "<root>"),
		}));
		expect(semantic).toMatchInlineSnapshot(`
			{
			  "migrations": [
			    {
			      "converted": 1,
			      "file": "<root>/src/Card.tsx",
			      "outcomes": [
			        {
			          "outcome": "static",
			          "sourceStart": 56,
			        },
			      ],
			      "residuals": 0,
			    },
			  ],
			}
		`);
	});

	test("returns a visible diagnostic when no target has been selected", async () => {
		const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-studio-empty-"));
		writeFileSync(join(root, "Card.tsx"), "export const Card = () => null;");
		roots.push(root);
		const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
		const opened = await workspace.open({ root });

		const result = await createStudioCodemodEvaluator().evaluate({
			workspace: opened,
			selection: null,
			target: null,
			theme: { scope: null },
		});

		expect(result.diagnostics).toMatchInlineSnapshot(`
			[
			  {
			    "kind": "lowering",
			    "message": "Choose a target adapter to evaluate this workspace",
			  },
			]
		`);
		expect(result.tree?.roots[0]?.label).toBe("Card.tsx");
	});
});
