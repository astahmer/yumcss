import { expect, test } from "vitest";
import { runAdapterMigration } from "../src/swap/adapter-migration.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

const migrateStyledComponents = (source: string, to: string, file = "Card.tsx") =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

test("pandwind -> styled-components emits documented prop callbacks as a style function", () => {
	const source =
		'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
		"const css = createUnsafeCss();\n" +
		"export const Card = css.class({ color: (props) => props.title });";
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.Pandwind,
		to: CodemodAdapterId.StyledComponents,
		file: "Card.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toMatch(/styled\.div\(\(props\)\s*=>\s*\(/u);
	expect(result.code).toContain("props.title");
	expect(result.code).not.toMatch(/styled\.div\(\s*\{[^}]*color:\s*\(?\s*props\s*=>/u);
	expect({
		converted: result.converted,
		residuals: result.residuals,
		code: result.code,
	}).toMatchInlineSnapshot(`
		{
		  "code": "import styled from "styled-components";

		export const Card = styled.div((props) => ({ color: props.title }));",
		  "converted": 1,
		  "residuals": [],
		}
	`);
});

test("pandwind -> styled-components preserves non-function dynamic values as a residual", () => {
	const source =
		'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
		"const css = createUnsafeCss();\n" +
		"export const Card = css.class({ color: readColor() });";
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.Pandwind,
		to: CodemodAdapterId.StyledComponents,
		file: "Card.tsx",
	});

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "dynamic-values",
				hint: expect.stringContaining("function-valued declarations"),
			}),
		]),
	);
	expect(result.code).toContain("css.class({ color: readColor() })");
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ converted: result.converted, skipped: result.skipped, residuals: result.residuals })
		.toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "styled-components style-object callbacks require function-valued declarations",
		      "kind": "dynamic-values",
		      "text": "readColor()",
		    },
		    {
		      "hint": "1 residual conversion(s)",
		      "kind": "validation",
		      "text": "styled.div()",
		    },
		  ],
		  "skipped": 1,
		}
	`);
});

test("styled-components -> tailwind keeps polymorphic JSX behind a component wrapper", () => {
	const source =
		'import styled from "styled-components";\n' +
		'const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/docs" />;';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Tailwind,
		file: "Card.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('Component = props.as ?? props.forwardedAs ?? "div"');
	expect(result.code).toContain("ref={ref}");
	expect(result.code).toContain("key.startsWith(prefix)");
	expect(result.code).toContain('<Card as="a" href="/docs" />');
	expect(result.code).not.toContain('<div as="a"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";
		const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();
		export const App = () => <Card as="a" href="/docs" />;"
	`);
});

test("styled-components -> tailwind preserves an exported component without an in-file use", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Tailwind,
		file: "Card.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('Component = props.as ?? props.forwardedAs ?? "div"');
	expect(result.code).toContain("ref={ref}");
	expect(result.code).toContain(
		'className={["[color:red]", props.className].filter(Boolean).join(" ")}',
	);
	expect(result.code).not.toContain('export const Card = "[color:red]"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";
		export const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();"
	`);
});

test("styled-components -> stylex keeps the component and polymorphic host contract", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/docs" />;';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.StyleX,
		file: "Card.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("const __CardStyle = stylex.create");
	expect(result.code).toContain("stylex.props(__CardStyle)");
	expect(result.code).toContain('attrs.as ?? props.as ?? "div"');
	expect(result.code).toContain('<Card as="a" href="/docs" />');
	expect(result.code).not.toContain('<div as="a"');
	expect(result.code).toMatchInlineSnapshot(`
		"import * as stylex from "@stylexjs/stylex";
		const __CardStyle = stylex.create({ style: { color: "red" } }).style;
		export const Card = (props) => { const attrs = {}; const Component = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...forwardedAttrs } = attrs; const styleProps = stylex.props(__CardStyle); return <Component {...rest} {...forwardedAttrs} className={[styleProps.className, props.className, attrs.className].filter(Boolean).join(" ")} style={{ ...styleProps.style, ...props.style, ...attrs.style }} />; };
		export const App = () => <Card as="a" href="/docs" />;"
	`);
});

test("styled-components -> stitches emits its component API", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Stitches,
		file: "Card.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { styled } from "@stitches/react";');
	expect(result.code).toContain('export const Card = styled("div", { color: "red" });');
	expect(result.code).not.toContain('import { css } from "@stitches/react";');
	expect(result.code).toMatchInlineSnapshot(`
		"import { styled } from "@stitches/react";
		export const Card = styled("div", { color: "red" });"
	`);
});

test("styled-components -> tamagui emits a component and maps as to render", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/docs" />;';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Tamagui,
		file: "Card.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('const __CardTamagui = styled(View, { color: "red" });');
	expect(result.code).toContain('render={attrs.as ?? props.as ?? "div"}');
	expect(result.code).toContain('<Card as="a" href="/docs" />');
	expect(result.code).not.toContain("createCx");
	expect(result.code).not.toContain("className={cx(styled");
	expect(result.code).toMatchInlineSnapshot(`
		"import { View, styled } from "@tamagui/core";
		const __CardTamagui = styled(View, { color: "red" });
		export const Card = (props) => { const attrs = {}; const { as: _as, ...rest } = props; const { as: _attrsAs, ...forwardedAttrs } = attrs; return <__CardTamagui {...rest} {...forwardedAttrs} render={attrs.as ?? props.as ?? "div"} />; };
		export const App = () => <Card as="a" href="/docs" />;"
	`);
});

test("styled-components -> solid-styled emits its documented tag factory", () => {
	const result = runAdapterMigration(
		'import styled from "styled-components";\n' +
			'export const Card = styled.div({ "background-color": "red", padding: "1rem" });',
		{
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.SolidStyled,
			file: "Card.tsx",
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: catalog.registry,
			semantic: { source: { framework: BuiltinHostFramework.React } },
		},
	);

	expect(
		result.converted,
		JSON.stringify({
			skipped: result.skipped,
			residuals: result.residuals,
			outcomes: result.outcomes,
			code: result.code,
		}),
	).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { styled } from "solid-styled-components";');
	expect(result.code).toContain(
		'styled("div")(() => ({ "backgroundColor": "red", "padding": "1rem" }))',
	);
	expect(result.code).not.toContain("styled.div({");
	expect(result.code).toMatchInlineSnapshot(`
		"import { styled } from "solid-styled-components";
		export const Card = styled("div")(() => ({ "backgroundColor": "red", "padding": "1rem" }));"
	`);
});

test("styled-components -> vue-styled emits a documented tagged template", () => {
	const result = runAdapterMigration(
		'import styled from "styled-components";\n' +
			'export const Card = styled.div({ color: "red", padding: "1rem" });',
		{
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.VueStyled,
			file: "Card.tsx",
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: catalog.registry,
			semantic: { source: { framework: BuiltinHostFramework.React } },
		},
	);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import styled from "vue-styled-components";');
	expect(result.code).toContain("styled.div`color: red; padding: 1rem;`");
	expect(result.code).not.toContain("styled.div({");
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "vue-styled-components";
		export const Card = styled.div\`color: red; padding: 1rem;\`;"
	`);
});

test("styled-components -> solid-styled keeps dynamic props in the target callback", () => {
	const result = migrateStyledComponents(
		'import styled from "styled-components";\n' +
			"export const Card = styled.div({ color: (props) => props.color });",
		CodemodAdapterId.SolidStyled,
	);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('styled("div")((props) => ({ "color": props.color }))');
	expect(result.code).not.toContain("styled.div({");
	expect(result.code).toMatchInlineSnapshot(`
		"import { styled } from "solid-styled-components";
		export const Card = styled("div")((props) => ({ "color": props.color }));"
	`);
});

test("styled-components -> vue-styled keeps dynamic props in the target template", () => {
	const result = migrateStyledComponents(
		'import styled from "styled-components";\n' +
			"export const Card = styled.div({ color: (props) => props.color });",
		CodemodAdapterId.VueStyled,
	);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('styled("div", { "color": null })');
	expect(result.code).toContain("${(props) => props.color}");
	expect(result.code).not.toContain("styled.div({");
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "vue-styled-components";
		export const Card = styled("div", { "color": null })\`color: \${(props) => props.color};\`;"
	`);
});

test("styled-components attrs override caller props in Tailwind component wrappers", () => {
	const result = migrateStyledComponents(
		'import styled from "styled-components";\n' +
			'const Link = styled.button.attrs({ as: "a", type: "button" })({ color: "red" });\n' +
			'export const App = () => <Link as="span" type="submit" data-testid="link" />;',
		CodemodAdapterId.Tailwind,
		"App.tsx",
	);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain(
		'Component = attrs.as ?? props.as ?? attrs.forwardedAs ?? props.forwardedAs ?? "button"',
	);
	expect(result.code).toContain("{ ...rest, ...attrsProps }");
	expect(result.code).toContain("ref={ref}");
	expect(result.code).toContain('as: "a"');
	expect(result.code).toContain('type: "button"');
	expect(result.code).toContain('data-testid="link"');
	expect(result.code).not.toContain("cx(");
	expect(result.code).toMatchInlineSnapshot(`
		"import { forwardRef as __pandwindLinkForwardRef } from "react";
		import type { ComponentPropsWithoutRef as __pandwindLinkPropsWithoutRef, ComponentRef as __pandwindLinkRef, ElementType as __pandwindLinkElementType, ReactElement as __pandwindLinkReactElement, Ref as __pandwindLinkRefProp } from "react";
		const Link = (() => { type __pandwindLinkProps<C extends __pandwindLinkElementType> = Omit<__pandwindLinkPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindLinkComponent = <C extends __pandwindLinkElementType = "button">(props: __pandwindLinkProps<C> & { ref?: __pandwindLinkRefProp<__pandwindLinkRef<C>> }) => __pandwindLinkReactElement | null; type __pandwindLinkRuntimeProps = Record<string, any>; return __pandwindLinkForwardRef<__pandwindLinkRef<"button">, __pandwindLinkRuntimeProps>((props, ref) => { const attrs: Record<string, any> = ({ as: "a", type: "button" }); const { as: _attrsAs, forwardedAs: _attrsForwardedAs, ...attrsProps } = attrs; const Component = attrs.as ?? props.as ?? attrs.forwardedAs ?? props.forwardedAs ?? "button"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries({ ...rest, ...attrsProps }).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red]", [attrs.className, props.className].filter(Boolean).join(" ")].filter(Boolean).join(" ")} style={{ ...props.style, ...attrs.style }} />; }) as __pandwindLinkComponent; })();
		export const App = () => <Link as="span" type="submit" data-testid="link" />;"
	`);
});

test("styled-components attrs-selected Pandwind hosts remain source-preserving", () => {
	const result = migrateStyledComponents(
		'import styled from "styled-components";\n' +
			'const Link = styled.button.attrs({ as: "a", type: "button" })({ color: "red" });\n' +
			'export const App = () => <Link as="span" type="submit" data-testid="link" />;',
		CodemodAdapterId.Pandwind,
		"App.tsx",
	);
	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.generatedFiles).toEqual([]);
	expect(result.code).toContain(
		'const Link = styled.button.attrs({ as: "a", type: "button" })({ color: "red" });',
	);
	expect(result.code).toContain('<Link as="span" type="submit" data-testid="link" />');
	expect(result.residuals).toEqual([expect.objectContaining({ kind: "host-framework" })]);
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "styled-components";
		// pandwind:migrate-skip (route: styled-components -> pandwind | lowering-residual: host-framework | available: static, named-map, residual)
		const Link = styled.button.attrs({ as: "a", type: "button" })({ color: "red" });
		export const App = () => <Link as="span" type="submit" data-testid="link" />;"
	`);
});

test("styled-components attrs override caller props in Tokenami component wrappers", () => {
	const result = migrateStyledComponents(
		'import styled from "styled-components";\n' +
			'const Link = styled.button.attrs({ as: "a", type: "button", "aria-label": "Save" })({ color: "red" });\n' +
			'export const App = () => <Link as="span" type="submit" data-testid="link" />;',
		CodemodAdapterId.Tokenami,
		"App.tsx",
	);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('Component = attrsAs ?? propsAs ?? "button"');
	expect(result.code).toContain("{...rest} {...attrsProps}");
	expect(result.code).toContain('type: "button"');
	expect(result.code).toContain('"aria-label": "Save"');
	expect(result.code).toContain('data-testid="link"');
	expect(result.code).toContain("style={css(css(");
	expect(result.code).toMatchInlineSnapshot(`
		"import { css } from "@tokenami/css";
		const Link = (props) => { const attrs = ({ as: "a", type: "button", "aria-label": "Save" }); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const { as: propsAs, className: propsClassName, style: propsStyle, ...rest } = props; const Component = attrsAs ?? propsAs ?? "button"; return <Component {...rest} {...attrsProps} className={[propsClassName, attrsClassName].filter(Boolean).join(" ") || undefined} style={css(css({ "--color": "red" }), propsStyle, attrsStyle)} />; };
		export const App = () => <Link as="span" type="submit" data-testid="link" />;"
	`);
});

test("styled-components attrs are preserved by every target or remain a typed source residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		'const Button = styled.button.attrs({ type: "button", "aria-label": "Save" })({ color: "red" });\n' +
		'export const App = () => <Button type="submit" aria-label="Caller" data-testid="save" />;';
	const summary = catalog.adapters
		.filter((adapter) => adapter.id !== CodemodAdapterId.StyledComponents)
		.map((adapter) => {
			const result = runAdapterMigration(source, {
				from: CodemodAdapterId.StyledComponents,
				to: adapter.id,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			});
			const residualKinds = [
				...new Set(result.residuals.map((residual) => residual.kind)),
			].toSorted();
			const residualDetails = result.residuals.map((residual) => ({
				kind: residual.kind,
				detail: residual.hint ?? residual.text,
			}));
			const sourcePreserved = result.code.includes(
				'styled.button.attrs({ type: "button", "aria-label": "Save" })',
			);
			const attrsPreserved =
				/\btype\s*(?:=|:)\s*["']button["']/u.test(result.code) &&
				/aria-label["']?\s*(?:=|:)\s*["']Save["']/u.test(result.code);
			const row = {
				target: adapter.id,
				converted: result.converted,
				skipped: result.skipped,
				residualKinds,
				residualDetails,
				sourcePreserved,
				attrsPreserved,
				callerPropsPreserved: result.code.includes('data-testid="save"'),
			};

			if (result.skipped > 0) {
				expect(result.converted, adapter.id).toBe(0);
				expect(result.residuals.length, adapter.id).toBeGreaterThan(0);
				for (const residual of result.residuals) {
					expect((residual.hint ?? residual.text).trim(), adapter.id).not.toBe("");
				}
				expect(result.code, adapter.id).toContain("pandwind:migrate-skip");
				expect(sourcePreserved, adapter.id).toBe(true);
				expect(result.code, adapter.id).toContain('data-testid="save"');
			} else {
				expect(result.converted, adapter.id).toBe(1);
				expect(result.residuals, adapter.id).toEqual([]);
				expect(sourcePreserved, adapter.id).toBe(false);
				expect(attrsPreserved, `${adapter.id}: source attrs disappeared: ${result.code}`).toBe(
					true,
				);
				expect(row.callerPropsPreserved, `${adapter.id}: caller props disappeared`).toBe(true);
				if (adapter.id === CodemodAdapterId.NextYak) {
					expect(result.code).toContain("forwardRef");
					expect(result.code).toContain("attrsProps");
					expect(result.code).toContain('import { css } from "next-yak"');
				}
			}

			return row;
		});

	expect(summary).toMatchInlineSnapshot(`
		[
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "pandwind",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "bamboo",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "chakra-ui",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "Emotion has no verified attrs component contract for preserving the source wrapper's props and refs",
		        "kind": "host-framework",
		      },
		    ],
		    "residualKinds": [
		      "host-framework",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "emotion",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "Vanilla Extract styles must be emitted from a .css.ts module",
		        "kind": "capability",
		      },
		      {
		        "detail": "Vanilla Extract style modules cannot contain a migrated component wrapper; preserve the component until a separate .css.ts style artifact and host wrapper can be emitted",
		        "kind": "component",
		      },
		    ],
		    "residualKinds": [
		      "capability",
		      "component",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "vanilla-extract",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "stitches",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "linaria",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "mantine",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "mui",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "next-yak",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "panda",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "tailwind",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "jss",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "stylex",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "React Strict DOM uses fixed html.* hosts and cannot preserve styled-components' polymorphic as contract",
		        "kind": "host-framework",
		      },
		    ],
		    "residualKinds": [
		      "host-framework",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "react-strict-dom",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "fela",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "goober",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "aphrodite",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "style9",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "Treat styles must be emitted from a .treat.ts or .treat.js module",
		        "kind": "capability",
		      },
		    ],
		    "residualKinds": [
		      "capability",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "treat",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "compiled",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "solid-styled",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "vue-styled",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "target adapter produced no representable output",
		        "kind": "emission-empty",
		      },
		      {
		        "detail": "React Native cannot preserve the button host semantics as a View",
		        "kind": "host-framework",
		      },
		    ],
		    "residualKinds": [
		      "emission-empty",
		      "host-framework",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "react-native",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "tokenami",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "unocss",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "components: component subject: styled.button.attrs({ type: "button", "aria-label": "Save" })",
		        "kind": "capability",
		      },
		      {
		        "detail": "target lacks framework semantics",
		        "kind": "framework-semantics",
		      },
		      {
		        "detail": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
		        "kind": "capability",
		      },
		    ],
		    "residualKinds": [
		      "capability",
		      "framework-semantics",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "authored-css",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "css-modules",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "components: component subject: styled.button.attrs({ type: "button", "aria-label": "Save" })",
		        "kind": "capability",
		      },
		      {
		        "detail": "target lacks framework semantics",
		        "kind": "framework-semantics",
		      },
		      {
		        "detail": "sass emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
		        "kind": "capability",
		      },
		    ],
		    "residualKinds": [
		      "capability",
		      "framework-semantics",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "sass",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 0,
		    "residualDetails": [
		      {
		        "detail": "components: component subject: styled.button.attrs({ type: "button", "aria-label": "Save" })",
		        "kind": "capability",
		      },
		      {
		        "detail": "target lacks framework semantics",
		        "kind": "framework-semantics",
		      },
		      {
		        "detail": "less emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
		        "kind": "capability",
		      },
		    ],
		    "residualKinds": [
		      "capability",
		      "framework-semantics",
		    ],
		    "skipped": 1,
		    "sourcePreserved": true,
		    "target": "less",
		  },
		  {
		    "attrsPreserved": true,
		    "callerPropsPreserved": true,
		    "converted": 1,
		    "residualDetails": [],
		    "residualKinds": [],
		    "skipped": 0,
		    "sourcePreserved": false,
		    "target": "tamagui",
		  },
		]
	`);
});
