import { fixtureAdapterRegistry } from "./route-spec-support.ts";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	runAdapterMigration,
	StyleProgramResidualKindTag,
} from "../src/swap/index.ts";

const yumcss = CodemodAdapterId.YumCSS;

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
		adapterRegistry: fixtureAdapterRegistry,
		...(semantic === undefined ? {} : { semantic }),
	});
}

describe("concrete adapter capability proofs", () => {
	test("lowers documented static APIs to YumCSS with exact evidence", () => {
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
				yumcss,
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
			    "code": "import "@emotion/css";
			import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red", padding: "1rem" });",
			    "converted": 1,
			    "id": "emotion-object-css",
			    "residuals": [],
			  },
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const Card = css.class({ color: "red", padding: "1rem" });
			export const App = () => <div className={Card} />;",
			    "converted": 1,
			    "id": "styled-components-subject",
			    "residuals": [],
			  },
			  {
			    "code": "import "@/styled-system/css";
			import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red", padding: "1rem" });",
			    "converted": 1,
			    "id": "panda-aliased-css",
			    "residuals": [],
			  },
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ color: "red", padding: "2px" }) };",
			    "converted": 1,
			    "id": "stylex-create",
			    "residuals": [],
			  },
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const useStyles = { "card": css.class({ color: "red", padding: 2 }) };",
			    "converted": 1,
			    "id": "jss-hook",
			    "residuals": [],
			  },
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			<div className={css.class({ color: "red", padding: "1rem" })}/>",
			    "converted": 1,
			    "id": "tailwind-arbitrary-properties",
			    "residuals": [],
			  },
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			<div className={css.class({ color: "red", padding: "1rem" })}/>",
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
		const result = migrate(source, CodemodAdapterId.StyledComponents, yumcss, "Card.tsx", {
			source: { framework: "react" },
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars");
		expect(result.code).toContain("props => props.color");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: (props => props.color)(props) }); const attrs = {}; const Component = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))); return <Component {...forwarded} className={css.props(staticClass, dynamic, "pw-1fn70s4", attrs.className, props.className).className} style={{ ...props.style, ...dynamic.style, ...attrs.style }} />; }; component.__yumcssClassName = "pw-1fn70s4"; return component; })();"
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
		const result = migrate(source, from, yumcss, "Card.tsx");
		const dynamicResidual = result.residuals.find(
			(residual) => residual.kind === StyleProgramResidualKindTag.Dynamic,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(dynamicResidual?.hint).toBe(hint);
		expect(result.code).toContain("yumcss:migrate-skip");
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
			  "code": "// yumcss:migrate-skip (route: class-adapter -> yumcss | parse-residual: dynamic)
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
	test("Emotion -> YumCSS -> Emotion keeps the documented object API", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red", padding: "1rem" });';
		const forward = migrate(source, CodemodAdapterId.Emotion, yumcss, "Card.tsx");
		const reverse = migrate(forward.code, yumcss, CodemodAdapterId.Emotion, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect({ forward: forward.code, reverse: reverse.code }).toMatchInlineSnapshot(`
			{
			  "forward": "import "@emotion/css";
			import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red", padding: "1rem" });",
			  "reverse": "import { css } from "@emotion/css";
			const card = css({ color: "red", padding: "1rem" });",
			}
		`);
	});

	test("Panda generated aliases -> YumCSS -> Panda do not retain shadowing imports", () => {
		const source =
			'import { css } from "@/styled-system/css";\n' +
			'const card = css({ color: "red", padding: "1rem" });';
		const forward = migrate(source, CodemodAdapterId.Panda, yumcss, "Card.tsx");
		const reverse = migrate(forward.code, yumcss, CodemodAdapterId.Panda, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(forward.code).toContain('import "@/styled-system/css";');
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.code).not.toContain("yumcss/css");
		expect(reverse.code).toMatchInlineSnapshot(`
			"import "@/styled-system/css";
			import { css } from "styled-system/css";
			const card = css({ color: "red", padding: "1rem" });"
		`);
	});

	test("Tailwind arbitrary properties -> YumCSS -> Tailwind removes unused runtime helpers", () => {
		const source = '<div className="[color:red] [padding:1rem]" />';
		const forward = migrate(source, CodemodAdapterId.Tailwind, yumcss, "Card.tsx");
		const reverse = migrate(forward.code, yumcss, CodemodAdapterId.Tailwind, "Card.tsx");

		expect(forward.converted).toBe(1);
		expect(forward.residuals).toEqual([]);
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.code).not.toContain("createCss");
		expect(reverse.code).toMatchInlineSnapshot(
			`"<div className={"[color:red] [padding:1rem]"}/>"`,
		);
	});
});
