import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteProject, createAdapterRouteSpec } from "./route-spec-support.ts";

const muiToPandwind = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.Pandwind);
const muiToTailwind = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.Tailwind);
const pandwindToMui = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.Mui);
const tailwindToMui = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);
const reactSemantic = { source: { framework: BuiltinHostFramework.React } };
const muiPandwindProject = createAdapterRouteProject(
	CodemodAdapterId.Mui,
	CodemodAdapterId.Pandwind,
	"#2563eb",
);

test("MUI sx spacing longhands, aliases, and gaps use the source theme scale", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ padding: 2, margin: 1, gap: 3, columnGap: 2, rowGap: 0.5, marginX: 1, paddingY: 0.5, marginInline: 1, paddingBlockStart: 0.5 }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('padding: "16px"');
	expect(result.code).toContain('margin: "8px"');
	expect(result.code).toContain('gap: "24px"');
	expect(result.code).toContain('columnGap: "16px"');
	expect(result.code).toContain('rowGap: "4px"');
	expect(result.code).toContain('marginInline: "8px"');
	expect(result.code).toContain('paddingBlockStart: "4px"');
	expect(result.code).toContain('marginLeft: "8px"');
	expect(result.code).toContain('marginRight: "8px"');
	expect(result.code).toContain('paddingTop: "4px"');
	expect(result.code).toContain('paddingBottom: "4px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ padding: "16px", margin: "8px", gap: "24px", columnGap: "16px", rowGap: "4px", marginLeft: "8px", marginRight: "8px", paddingTop: "4px", paddingBottom: "4px", marginInline: "8px", paddingBlockStart: "4px" })} />;"
	`);
});

test("MUI sx sizing and numeric borders become their CSS values", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ width: 0.5, maxWidth: 1, minHeight: 0.25, border: 1, borderTop: 2, borderRadius: 1 }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('width: "50%"');
	expect(result.code).toContain('maxWidth: "100%"');
	expect(result.code).toContain('minHeight: "25%"');
	expect(result.code).toContain('border: "1px solid"');
	expect(result.code).toContain('borderTop: "2px solid"');
	expect(result.code).toContain('borderRadius: "4px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ width: "50%", maxWidth: "100%", minHeight: "25%", border: "1px solid", borderTop: "2px solid", borderRadius: "4px" })} />;"
	`);
});

test("MUI numeric shadow tokens need the effective source theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI boxShadow theme value '1'"),
			}),
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI zIndex theme value 'modal'"),
			}),
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI maxWidth breakpoint 'md'"),
			}),
		]),
	);
	expect(result.code).toContain("pandwind:migrate-skip");
	expect(result.code).toContain('sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }}');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <Box sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }} />;"
	`);
});

test("MUI CSS keywords convert without a project theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ boxShadow: "none", zIndex: "auto", maxWidth: "max-content" }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('boxShadow: "none"');
	expect(result.code).toContain('zIndex: "auto"');
	expect(result.code).toContain('maxWidth: "max-content"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ boxShadow: "none", zIndex: "auto", maxWidth: "max-content" })} />;"
	`);
});

test("MUI styled declarations preserve component shape and plain CSS semantics", () => {
	const source = `import { styled } from "@mui/system";
export const Card = styled("div")({ padding: 2 });
export const Panel = styled("section")({ margin: 3 });`;
	const result = muiToPandwind.run({
		source,
		file: "Card.tsx",
		project: muiPandwindProject,
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(2);
	expect(result.code).toContain("export const Card = __pandwindSlot(");
	expect(result.code).toContain("export const Panel = __pandwindSlot(");
	expect(result.code.match(/__pandwindSlot\(/gu)).toHaveLength(2);
	expect(result.code).not.toContain("export const Card = css.class");
	expect(result.code).toContain('from "./__pandwind/slot"');
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles?.map((file) => file.path)).toContain("__pandwind/slot.tsx");
	expect(
		result.generatedFiles?.find((file) => file.path === "__pandwind/slot.tsx")?.content,
	).toContain("forwardRef");
	expect(result.generatedFiles?.find((file) => file.path === "__pandwind/slot.tsx")?.content)
		.toMatchInlineSnapshot(`
		"import { createElement, forwardRef } from "react";
		import type { ComponentPropsWithoutRef, ComponentRef, CSSProperties, ElementType, ReactElement, Ref } from "react";

		type PandwindSlotTransientProps<Prefix extends string> = {
			readonly [key in \`\${Prefix}\${string}\`]?: unknown;
		};
		type PandwindSlotProps<Component extends ElementType, Prefix extends string> = Omit<ComponentPropsWithoutRef<Component>, "as" | "className"> & PandwindSlotTransientProps<Prefix> & {
			readonly as?: Component;
			readonly className?: string;
			readonly ref?: Ref<ComponentRef<Component>>;
		};
		type PandwindSlotComponent<DefaultComponent extends ElementType, Prefix extends string> = <Component extends ElementType = DefaultComponent>(
			props: PandwindSlotProps<Component, Prefix>,
		) => ReactElement | null;
		type PandwindSlotRuntimeProps = Record<string, unknown> & {
			readonly as?: ElementType;
			readonly className?: string;
			readonly style?: CSSProperties;
		};
		type PandwindSlotOptions<DefaultComponent extends ElementType, Prefix extends string> = {
			readonly defaultComponent: DefaultComponent;
			readonly style: string;
			readonly stableClass: string;
			readonly inheritedClass?: string;
			readonly classAttribute: string;
			readonly filteredPropPrefixes: readonly Prefix[];
			readonly attrs: Readonly<Record<string, unknown>> & {
				readonly as?: ElementType;
				readonly className?: string;
				readonly style?: CSSProperties;
			};
			readonly joinClass: (...values: (string | undefined)[]) => string;
		};
		const isPandwindSlotElementType = (value: unknown): value is ElementType =>
			typeof value === "string" ||
			typeof value === "function" ||
			typeof value === "symbol" ||
			(typeof value === "object" && value !== null);

		export const __pandwindSlot = <DefaultComponent extends ElementType, Prefix extends string = never>({
			defaultComponent,
			style,
			stableClass,
			inheritedClass,
			classAttribute,
			filteredPropPrefixes,
			attrs,
			joinClass,
		}: PandwindSlotOptions<DefaultComponent, Prefix>) => {
			const component = forwardRef<unknown, PandwindSlotRuntimeProps>((props, ref) => {
				const Component = isPandwindSlotElementType(props.as) ? props.as : defaultComponent;
				const { as: _as, ...rest } = props;
				const { as: _attrsAs, ...attrsProps } = attrs;
				const forwarded =
					filteredPropPrefixes.length === 0
						? { ...rest, ...attrsProps }
						: Object.fromEntries(
								[...Object.entries(rest), ...Object.entries(attrsProps)].filter(
									([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)),
								),
							);
				const attrsClassName = typeof attrs.className === "string" ? attrs.className : undefined;
				const propsClassName = typeof props.className === "string" ? props.className : undefined;
				return createElement(Component, {
					...forwarded,
					ref,
					[classAttribute]: joinClass(
						style,
						stableClass,
						inheritedClass,
						attrsClassName,
						propsClassName,
					),
				});
			});
			return Object.assign(component as unknown as PandwindSlotComponent<DefaultComponent, Prefix>, {
				__pandwindClassName: stableClass,
			});
		};
		"
	`);
	expect(result.code).toContain("padding: 2");
	expect(result.code).not.toContain('padding: "16px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		import { createCx } from "pandwind/cx";
		import { __pandwindSlot } from "./__pandwind/slot";
		const cx = createCx();
		const css = createUnsafeCss();
		export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ padding: 2 }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });
		export const Panel = __pandwindSlot({ defaultComponent: "section", style: css.class({ margin: 3 }), stableClass: "pw-1yrm3hy", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });"
	`);
});

test("MUI Box component prop becomes the same intrinsic host", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box component="section" sx={{ color: "red" }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("<section");
	expect(result.code).not.toContain('component="section"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <section className={css.class({ color: "red" })} />;"
	`);
});

test("MUI component behavior survives style extraction", () => {
	const source = `import { Button } from "@mui/material";
export const App = () => <Button variant="contained" size="large" sx={{ p: 2 }}>Save</Button>;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.code).toContain("<Button");
	expect(result.code).toContain('variant="contained"');
	expect(result.code).toContain('size="large"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Button } from "@mui/material";
		import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <Button variant="contained" size="large" className={css.class({ padding: "16px" })}>Save</Button>;"
	`);
});

test("Pandwind numeric CSS values stay literal in MUI sx", () => {
	const source = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const card = css.class({ padding: 4, width: 0.5, height: 1, borderRadius: 1, fontSize: 14, letterSpacing: 0.5 });
export const App = () => <div className={card} />;`;
	const result = pandwindToMui.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('padding: "4px"');
	expect(result.code).toContain('width: "0.5px"');
	expect(result.code).toContain('borderRadius: "1px"');
	expect(result.code).toContain('height: "1px"');
	expect(result.code).toContain('fontSize: "14px"');
	expect(result.code).toContain('letterSpacing: "0.5px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";

		const card = { padding: "4px", width: "0.5px", height: "1px", borderRadius: "1px", fontSize: "14px", letterSpacing: "0.5px" };
		export const App = () => <Box component="div" sx={card} />;"
	`);
});

test("isolated class styles remain residual until an MUI host can consume sx", () => {
	const source = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export const card = css.class({ color: "red", padding: "4px" });`;
	const result = pandwindToMui.run({ source, file: "styles.ts" });

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "host-framework",
				hint: expect.stringContaining("MUI sx output requires a MUI-owned component"),
			}),
		]),
	);
	expect(result.code).toContain("pandwind:migrate-skip");
	expect(result.code).toContain('css.class({ color: "red", padding: "4px" })');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		// pandwind:migrate-skip (route: pandwind -> mui | lowering-residual: host-framework | available: static, named-map, residual)
		export const card = css.class({ color: "red", padding: "4px" });"
	`);
});

test("MUI runtime themes remain explicit residuals", () => {
	const styledSource = `import { styled } from "@mui/system";
export const Card = styled("div")((theme) => ({ color: theme.palette.primary.main }));`;
	const providerSource = `import { ThemeProvider } from "@mui/material/styles";
export const App = () => <ThemeProvider theme={theme}><main /></ThemeProvider>;`;
	const styledResult = muiToPandwind.run({
		source: styledSource,
		file: "Card.tsx",
		semantic: reactSemantic,
	});
	const providerResult = muiToPandwind.run({
		source: providerSource,
		file: "App.tsx",
		semantic: reactSemantic,
	});

	for (const result of [styledResult, providerResult]) {
		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "runtime-context",
				}),
			]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
	}
	expect(styledResult.code).toContain(
		'styled("div")((theme) => ({ color: theme.palette.primary.main }))',
	);
	expect(providerResult.code).toContain("<ThemeProvider theme={theme}>");
	expect({ styled: styledResult.code, provider: providerResult.code }).toMatchInlineSnapshot(`
		{
		  "provider": "// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
		import { ThemeProvider } from "@mui/material/styles";
		// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <ThemeProvider theme={theme}><main /></ThemeProvider>;",
		  "styled": "import { styled } from "@mui/system";
		// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
		export const Card = styled("div")((theme) => ({ color: theme.palette.primary.main }));",
		}
	`);
});

test("unresolved MUI sx theme paths do not invent CSS variables", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ color: "brand.main" }} />;`;
	const result = muiToTailwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.code).toContain('color: "brand.main"');
	expect(result.code).not.toContain("var(--mui-");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// pandwind:migrate-skip (route: mui -> tailwind | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <Box sx={{ color: "brand.main" }} />;"
	`);
});

test("generated MUI Box aliases close with the same JSX binding", () => {
	const source = `const Box = () => null;
export const App = () => <div className="[color:red]"><Box /></div>;`;
	const result = tailwindToMui.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { Box as MuiBox } from "@mui/material";');
	expect(result.code).toContain("</MuiBox>");
	expect(result.code).not.toContain("</Box>");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box as MuiBox } from "@mui/material";
		const Box = () => null;
		export const App = () => <MuiBox component="div" sx={{ color: "red" }}><Box /></MuiBox>;"
	`);
});
