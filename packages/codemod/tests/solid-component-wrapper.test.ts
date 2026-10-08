import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { BuiltinHostFramework } from "../src/swap/host-adapters.ts";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";
import { preflightHostComponentDeclaration } from "../src/swap/host-component-rewriter.ts";

const source = `import { styled } from "solid-styled-components";
export const Card = styled.div({ color: "red" });
export const App = () => <Card id="card" class="caller" ref={(element) => element.focus()} onClick={(event) => event.currentTarget.id}>
	<span>child</span>
</Card>;
`;

const migrate = (input: string) =>
	runAdapterMigration(input, {
		from: CodemodAdapterId.SolidStyled,
		to: CodemodAdapterId.Tailwind,
		file: "Card.tsx",
		mode: "safe",
	});

const typecheckGeneratedSolid = (generatedSource: string): string => {
	const projectRoot = resolve(import.meta.dirname, "../../yumcss");
	const temporaryDirectory = mkdtempSync(resolve(projectRoot, ".codemod-solid-wrapper-"));
	const generatedFile = join(temporaryDirectory, "SolidWrapper.tsx");
	const sourceModuleTypes = join(temporaryDirectory, "source-module.d.ts");
	try {
		writeFileSync(sourceModuleTypes, 'declare module "solid-styled-components";\n');
		writeFileSync(generatedFile, generatedSource);
		const result = spawnSync(
			"pnpm",
			[
				"exec",
				"tsc",
				"--ignoreConfig",
				"--noEmit",
				"--jsx",
				"preserve",
				"--jsxImportSource",
				"solid-js",
				"--module",
				"ESNext",
				"--moduleResolution",
				"Bundler",
				"--strict",
				"--skipLibCheck",
				sourceModuleTypes,
				generatedFile,
			],
			{ cwd: projectRoot, encoding: "utf8" },
		);
		return result.status === 0 ? "" : result.stderr || result.error?.message || result.stdout;
	} finally {
		rmSync(temporaryDirectory, { force: true, recursive: true });
	}
};

describe("Solid class component wrappers", () => {
	test("preserves intrinsic props, caller classes, children, and refs with installed Solid types", () => {
		const result = migrate(source);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("Children(() => local.children)");
		expect(result.code).toContain("ref={local.ref}");
		expect(result.code).toContain('class={["[color:red]", local.class].filter(Boolean).join(" ")}');
		expect(result.code).toContain("onClick={(event) => event.currentTarget.id}");
		expect(result.code).toContain("<span>child</span>");
		expect(typecheckGeneratedSolid(result.code)).toBe("");
	});

	test("keeps unverified Solid wrapper semantics as typed preflight residuals", () => {
		const cases = [
			{
				name: "custom component host",
				override: { tag: "Button" },
				hint: "Solid class wrappers currently require a verified intrinsic host",
			},
			{
				name: "transient prop filtering",
				override: { filteredPropPrefixes: ["$"] },
				hint: "Solid class wrappers cannot prove source transient-prop filtering",
			},
			{
				name: "attrs precedence",
				override: { attrsExpression: "{ class: 'source' }" },
				hint: "Solid class wrappers do not yet preserve styled-component attrs precedence",
			},
			{
				name: "dynamic style carrier",
				override: { styleExpression: "dynamicStyle" },
				hint: "Solid class wrappers do not yet preserve a dynamic style carrier",
			},
		] as const;
		const results = cases.map(({ override }) =>
			preflightHostComponentDeclaration({
				file: "Card.tsx",
				framework: BuiltinHostFramework.Solid,
				binding: "Card",
				tag: "div",
				...override,
			}),
		);

		expect(
			results.map((result, index) => ({
				name: cases[index]?.name,
				changed: result.changed,
				residuals: result.residuals,
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "changed": false,
			    "name": "custom component host",
			    "residuals": [
			      {
			        "hint": "Solid class wrappers currently require a verified intrinsic host",
			        "kind": "host-framework",
			        "text": "Button",
			      },
			    ],
			  },
			  {
			    "changed": false,
			    "name": "transient prop filtering",
			    "residuals": [
			      {
			        "hint": "Solid class wrappers cannot prove source transient-prop filtering",
			        "kind": "host-framework",
			        "text": "Card",
			      },
			    ],
			  },
			  {
			    "changed": false,
			    "name": "attrs precedence",
			    "residuals": [
			      {
			        "hint": "Solid class wrappers do not yet preserve styled-component attrs precedence",
			        "kind": "host-framework",
			        "text": "{ class: 'source' }",
			      },
			    ],
			  },
			  {
			    "changed": false,
			    "name": "dynamic style carrier",
			    "residuals": [
			      {
			        "hint": "Solid class wrappers do not yet preserve a dynamic style carrier",
			        "kind": "host-framework",
			        "text": "Card",
			      },
			    ],
			  },
			]
		`);
		expect(results.every((result) => !result.changed)).toBe(true);
		expect(results.map((result) => result.residuals[0]?.hint)).toEqual(
			cases.map(({ hint }) => hint),
		);
	});
});
