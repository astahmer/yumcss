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

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toMatch(/export const Card = forwardRef/u);
	expect(result.code).toContain('import styles from "./Card.module.css";');
	expect(result.code).toContain("ComponentPropsWithoutRef<\"div\">");
	expect(result.code).toContain("ref");
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]).toMatchObject({ path: "src/Card.module.css" });
	expect(result.generatedFiles[0]?.content).toContain(".root {");
	expect(result.generatedFiles[0]?.content).toContain("padding: 1rem;");
	expect(result.code).not.toContain("styled-components");
	expect(unchangedConsumer).toContain('import { Card } from "./Card";');
	expect({
		code: result.code,
		converted: result.converted,
		generatedFiles: result.generatedFiles,
		residuals: result.residuals,
	}).toMatchInlineSnapshot();
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
				hint: expect.stringContaining("static React styled intrinsic"),
			}),
		]),
	);
	expect(result.code).toContain(source);
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot();
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
	expect(polymorphic.code).toContain(polymorphicSource.slice(polymorphicSource.indexOf("export const")));
	expect(attrs.code).toContain(attrsSource.slice(attrsSource.indexOf("export const")));
	expect({
		polymorphic: polymorphic.residuals,
		attrs: attrs.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "attrs": [
		    {
		      "hint": "components: component subject: styled.button.attrs({ type: "button" })",
		      "kind": "capability",
		      "text": "styled.button.attrs({ type: "button" })({ color: "red" })",
		    },
		    {
		      "hint": "target lacks framework semantics",
		      "kind": "framework-semantics",
		      "text": "react",
		    },
		    {
		      "hint": "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
		      "kind": "capability",
		      "text": "import styled from "styled-components";
		export const Card = styled.button.attrs({ type: "button" })({ color: "red" });",
		    },
		  ],
		  "polymorphic": [
		    {
		      "hint": "components: component subject: styled.div",
		      "kind": "capability",
		      "text": "styled.div({ color: "red" })",
		    },
		    {
		      "hint": "target lacks framework semantics",
		      "kind": "framework-semantics",
		      "text": "react",
		    },
		    {
		      "hint": "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
		      "kind": "capability",
		      "text": "import styled from "styled-components";
		export const Card = styled.div({ color: "red" });
		export const App = () => <Card as="a" href="/">link</Card>;",
		    },
		  ],
		}
	`);
});
