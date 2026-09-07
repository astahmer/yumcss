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
			      "id": "sass",
			      "label": "sass",
			      "role": "both",
			    },
			    {
			      "id": "less",
			      "label": "less",
			      "role": "both",
			    },
			    {
			      "id": "tamagui",
			      "label": "tamagui",
			      "role": "both",
			    },
			  ],
			  "sourceCount": 31,
			  "targetCount": 34,
			}
		`);
	});

	test("detects a source adapter and returns the target source without writing files", async () => {
		const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-studio-evaluator-"));
		mkdirSync(join(root, "src"));
		const file = join(root, "src", "Card.tsx");
		writeFileSync(
			join(root, "src", "theme.css"),
			'@theme { --color-brand: red; }\n[data-theme="dark"] { --color-brand: blue; }',
		);
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
			theme: { scope: '[data-theme="dark"]' },
		};
		const result = await createStudioCodemodEvaluator().evaluate(request);

		expect(result.artifacts?.targetCode).toContain("css.class");
		expect(result.artifacts?.sourceCode).toContain("@emotion/css");
		expect(result.execution).toMatchObject({
			lane: "in-process",
			verified: ["migration", "canonical-css"],
			unavailable: ["project-typecheck", "project-build", "browser-host", "ssr-hydration"],
		});
		expect(result.semantic).toHaveProperty("programs");
		expect(result.themes).toMatchInlineSnapshot(`
			{
			  "activeScope": "[data-theme="dark"]",
			  "scopes": [
			    {
			      "selector": ":root",
			      "variables": [
			        {
			          "name": "--color-brand",
			          "value": "red",
			        },
			      ],
			    },
			    {
			      "selector": "[data-theme="dark"]",
			      "variables": [
			        {
			          "name": "--color-brand",
			          "value": "blue",
			        },
			      ],
			    },
			  ],
			}
		`);
		expect(result.artifacts?.sourceCss).toBeDefined();
		expect(result.artifacts?.targetCss).toBeDefined();
		expect({
			sourceCss: result.artifacts?.sourceCss,
			targetCss: result.artifacts?.targetCss,
		}).toMatchInlineSnapshot(`
			{
			  "sourceCss": "&{color:red}",
			  "targetCss": "&{color:red}",
			}
		`);
		expect(result.tree?.roots).toHaveLength(1);
		const semantic = result.semantic as {
			migrations: Array<{ file: string; converted: number; residuals: number; outcomes: unknown }>;
		};
		semantic.migrations = semantic.migrations.map((migration) => ({
			...migration,
			file: migration.file.replace(root, "<root>"),
		}));
		expect({ migrations: semantic.migrations }).toMatchInlineSnapshot(`
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
		expect(result.execution).toMatchObject({
			lane: "in-process",
			verified: [],
			unavailable: ["project-typecheck", "project-build", "browser-host", "ssr-hydration"],
		});
		expect(result.tree?.roots[0]?.label).toBe("Card.tsx");
	});
});
