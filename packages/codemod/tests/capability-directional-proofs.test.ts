import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	StyleProgramResidualKindTag,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const pandwind = CodemodAdapterId.Pandwind;

function migrate(
	source: string,
	from: CodemodAdapterId,
	to: CodemodAdapterId,
	file: string,
	semantic?: Parameters<typeof runAdapterMigration>[1]["semantic"],
) {
	return runAdapterMigration(source, {
		from,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		...(semantic === undefined ? {} : { semantic }),
	});
}

describe("concrete adapter capability proofs", () => {
	test("lowers documented static APIs to Pandwind with exact evidence", () => {
		const cases = [
			{
				id: "emotion-object-css",
				from: CodemodAdapterId.Emotion,
				file: "Card.tsx",
				source:
					'import { css } from "@emotion/css";\n' +
					'const card = css({ color: "red", padding: "1rem" });',
			},
			{
				id: "styled-components-subject",
				from: CodemodAdapterId.StyledComponents,
				file: "Card.tsx",
				source:
					'import styled from "styled-components";\n' +
					'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
					"export const App = () => <Card />;",
				semantic: { source: { framework: "react" } },
			},
			{
				id: "panda-aliased-css",
				from: CodemodAdapterId.Panda,
				file: "Card.tsx",
				source:
					'import { css } from "@/styled-system/css";\n' +
					'const card = css({ color: "red", padding: "1rem" });',
			},
			{
				id: "stylex-create",
				from: CodemodAdapterId.StyleX,
				file: "Card.tsx",
				source:
					'import * as stylex from "@stylexjs/stylex";\n' +
					'const styles = stylex.create({ card: { color: "red", padding: 2 } });',
			},
			{
				id: "jss-hook",
				from: CodemodAdapterId.Jss,
				file: "styles.ts",
				source:
					'import { createUseStyles } from "react-jss";\n' +
					'const useStyles = createUseStyles({ card: { color: "red", padding: 2 } });',
			},
			{
				id: "tailwind-arbitrary-properties",
				from: CodemodAdapterId.Tailwind,
				file: "Card.tsx",
				source: '<div className="[color:red] [padding:1rem]" />',
			},
			{
				id: "unocss-arbitrary-properties",
				from: CodemodAdapterId.UnoCSS,
				file: "Card.tsx",
				source: '<div class="[color:red] [padding:1rem]" />',
			},
		] as const;

		const outputs = cases.map((fixture) => {
			const result = migrate(
				fixture.source,
				fixture.from,
				pandwind,
				fixture.file,
				"semantic" in fixture ? fixture.semantic : undefined,
			);
			expect(result.converted, fixture.id).toBeGreaterThan(0);
			expect(result.skipped, fixture.id).toBe(0);
			expect(result.residuals, fixture.id).toEqual([]);
			expect(
				result.validations.every((validation) => validation.valid),
				fixture.id,
			).toBe(true);
			return {
				id: fixture.id,
				code: result.code,
				converted: result.converted,
				residuals: result.residuals,
			};
		});

		expect(outputs).toMatchInlineSnapshot(`
			[
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const card = css.class({ padding: "1rem", color: "red" });",
			    "converted": 1,
			    "id": "emotion-object-css",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const Card = css.class({ padding: "1rem", color: "red" });
			export const App = () => <div className={Card} />;",
			    "converted": 1,
			    "id": "styled-components-subject",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const card = css.class({ padding: "1rem", color: "red" });",
			    "converted": 1,
			    "id": "panda-aliased-css",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const styles = { "card": css.class({ padding: "2px", color: "red" }) };",
			    "converted": 1,
			    "id": "stylex-create",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const useStyles = { "card": css.class({ padding: 2, color: "red" }) };",
			    "converted": 1,
			    "id": "jss-hook",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			<div className={css.class({ padding: "1rem", color: "red" })}/>",
			    "converted": 1,
			    "id": "tailwind-arbitrary-properties",
			    "residuals": [],
			  },
			  {
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			<div className={css.class({ padding: "1rem", color: "red" })}/>",
			    "converted": 1,
			    "id": "unocss-arbitrary-properties",
			    "residuals": [],
			  },
			]
		`);
	});

	test("lowers a genuine dynamic interpolation through the runtime fallback", () => {
		const source =
			'import styled from "styled-components";\n' +
			"const Card = styled.div({ color: props => props.color });";
		const result = migrate(source, CodemodAdapterId.StyledComponents, pandwind, "Card.tsx", {
			source: { framework: "react" },
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars");
		expect(result.code).toContain("props => props.color");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: (props => props.color)(props) }); const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(staticClass, dynamic.class, "pw-1fn70s4", props.className)} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();"
		`);
	});

	test.each([
		{
			id: "tailwind",
			from: CodemodAdapterId.Tailwind,
			attribute: "className",
			hint: "Tailwind dynamic class expressions require runtime-aware target lowering",
		},
		{
			id: "unocss",
			from: CodemodAdapterId.UnoCSS,
			attribute: "class",
			hint: "UnoCSS dynamic class expressions require runtime-aware target lowering",
		},
	] as const)("keeps $id dynamic class bindings visible", ({ from, attribute, hint }) => {
		const source = "<div " + attribute + '={["color:red", runtimeClass].join(" ")} />';
		const result = migrate(source, from, pandwind, "Card.tsx");
		const dynamicResidual = result.residuals.find(
			(residual) => residual.kind === StyleProgramResidualKindTag.Dynamic,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(dynamicResidual?.hint).toBe(hint);
		expect(result.code).toContain("pandwind:migrate-skip");
		const output = {
			code: result.code
				.replaceAll(attribute, "className")
				.replace(/tailwind|unocss/giu, "class-adapter"),
			residuals: result.residuals.map((residual) => ({
				...residual,
				text: residual.text.replaceAll(attribute, "className"),
				hint: residual.hint?.replace(/tailwind|unocss/giu, "class-adapter"),
			})),
		};
		expect(output).toMatchInlineSnapshot(`
			{
			  "code": "// pandwind:migrate-skip (route: class-adapter -> pandwind | parse-residual: dynamic)
			<div className={["color:red", runtimeClass].join(" ")} />",
			  "residuals": [
			    {
			      "hint": "class-adapter dynamic class expressions require runtime-aware target lowering",
			      "kind": "dynamic",
			      "text": "className={["color:red", runtimeClass].join(" ")}",
			    },
			  ],
			}
		`);
	});
});

describe("explicit adapter round trips", () => {
	test("Emotion -> Pandwind -> Emotion keeps the documented object API", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red", padding: "1rem" });';
		const forward = migrate(source, CodemodAdapterId.Emotion, pandwind, "Card.tsx");
		const reverse = migrate(forward.code, pandwind, CodemodAdapterId.Emotion, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect({ forward: forward.code, reverse: reverse.code }).toMatchInlineSnapshot(`
			{
			  "forward": "import { createCss } from "pandwind/css";
			const css = createCss();

			const card = css.class({ padding: "1rem", color: "red" });",
			  "reverse": "import { css } from "@emotion/css";

			const card = css({ padding: "1rem", color: "red" });",
			}
		`);
	});

	test("Panda generated aliases -> Pandwind -> Panda do not retain shadowing imports", () => {
		const source =
			'import { css } from "@/styled-system/css";\n' +
			'const card = css({ color: "red", padding: "1rem" });';
		const forward = migrate(source, CodemodAdapterId.Panda, pandwind, "Card.tsx");
		const reverse = migrate(forward.code, pandwind, CodemodAdapterId.Panda, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(forward.code).not.toContain("@/styled-system/css");
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.code).not.toContain("pandwind/css");
		expect(reverse.code).toMatchInlineSnapshot(`
			"import { css } from "styled-system/css";

			const card = css({ padding: "1rem", color: "red" });"
		`);
	});

	test("Tailwind arbitrary properties -> Pandwind -> Tailwind removes unused runtime helpers", () => {
		const source = '<div className="[color:red] [padding:1rem]" />';
		const forward = migrate(source, CodemodAdapterId.Tailwind, pandwind, "Card.tsx");
		const reverse = migrate(forward.code, pandwind, CodemodAdapterId.Tailwind, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.code).not.toContain("createCss");
		expect(reverse.code).toMatchInlineSnapshot(
			`
			"
			<div className={"[padding:1rem] [color:red]"}/>"
		`,
		);
	});
});
