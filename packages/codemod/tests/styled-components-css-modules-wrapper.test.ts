import { expect, test } from "vitest";
import { runAdapterMigration } from "../src/swap/adapter-migration.ts";
import { BuiltinHostFramework, CodemodAdapterId, createBuiltinCodemodCatalog } from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const root = "/virtual/css-modules-project";

const migrate = (source: string) =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.CssModules,
		file: "src/Card.tsx",
		root,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

test("styled-components -> CSS Modules keeps a reusable React component export", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red", padding: "1rem" });';
	const unchangedConsumer =
		'import { Card } from "./Card";\n' +
		'export const App = () => <Card title="Reusable" ref={cardRef}>content</Card>;';
	const result = migrate(source);

	expect({
		code: result.code,
		converted: result.converted,
		generatedFiles: result.generatedFiles,
		residuals: result.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "code": "import __pandwindCardStyles from "./Card.module.css";
		import { forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = __pandwindCardForwardRef<__pandwindCardComponentRef<"div">, __pandwindCardComponentProps<"div">>(({ className, ...props }, ref) => (<div {...props} ref={ref} className={[__pandwindCardStyles.root, className].filter(Boolean).join(" ")} />));",
		  "converted": 1,
		  "generatedFiles": [
		    {
		      "content": ".root { padding: 1rem; color: red; }
		",
		      "path": "src/Card.module.css",
		      "purpose": "CSS Modules styles for a migrated React component",
		    },
		  ],
		  "residuals": [],
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toMatch(/export const Card = __pandwindCardForwardRef/u);
	expect(result.code).toContain('import __pandwindCardStyles from "./Card.module.css";');
	expect(result.code).toContain("__pandwindCardComponentProps<\"div\">");
	expect(result.code).toContain("ref");
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]).toMatchObject({ path: "src/Card.module.css" });
	expect(result.generatedFiles[0]?.content).toContain(".root {");
	expect(result.generatedFiles[0]?.content).toContain("padding: 1rem;");
	expect(result.code).not.toContain("styled-components");
	expect(unchangedConsumer).toContain('import { Card } from "./Card";');
	const rerun = migrate(result.code);
	expect(rerun.changed).toBe(false);
	expect(rerun.generatedFiles).toEqual([]);
});

test("styled-components -> CSS Modules preserves dynamic component styles as a residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		"export const Card = styled.div({ color: (props) => props.color });";
	const result = migrate(source);

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				hint: expect.stringContaining("dynamic values need"),
			}),
		]),
	);
	expect(result.code).toContain('export const Card = styled.div({ color: (props) => props.color });');
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "function-values: dynamic: (props) => props.color",
		      "kind": "capability",
		      "text": "styled.div({ color: (props) => props.color })",
		    },
		    {
		      "hint": "dynamic values need a target runtime or verified CSS variable carrier",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules preserves polymorphic and attrs components as residuals", () => {
	const polymorphicSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/">link</Card>;';
	const attrsSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button" })({ color: "red" });';
	const polymorphic = migrate(polymorphicSource);
	const attrs = migrate(attrsSource);

	for (const result of [polymorphic, attrs]) {
		expect(result.converted).toBe(0);
		expect(result.generatedFiles).toEqual([]);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.residuals.length).toBeGreaterThan(0);
	}
	expect(polymorphic.code).toContain('export const App = () => <Card as="a" href="/">link</Card>;');
	expect(polymorphic.code).not.toContain('<div as="a"');
	expect(attrs.code).toContain('export const Card = styled.button.attrs({ type: "button" })({ color: "red" });');
	expect({
		polymorphic: polymorphic.residuals,
		attrs: attrs.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "attrs": [
		    {
		      "hint": "components: component subject: styled.button.attrs({ type: "button" }); framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.button.attrs({ type: "button" })({ color: "red" })",
		    },
		    {
		      "hint": "styled-components attrs semantics need a target-specific precedence projection",
		      "kind": "capability",
		      "text": "styled.button.attrs({ type: "button" })",
		    },
		    {
		      "hint": "css-modules can emit only static React styled intrinsics without attrs or polymorphic as props",
		      "kind": "capability",
		      "text": "Card",
		    },
		  ],
		  "polymorphic": [
		    {
		      "hint": "components: component subject: styled.div; framework-semantics: react",
		      "kind": "capability",
		      "text": "styled.div({ color: "red" })",
		    },
		    {
		      "hint": "the component has polymorphic as usage",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});
