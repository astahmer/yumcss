import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId } from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
import { createAdapterRouteProject, createAdapterRouteSpec } from "./route-spec-support.ts";

const muiToYumCSS = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.YumCSS);
const muiToTailwind = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.Tailwind);
const yumcssToMui = createAdapterRouteSpec(CodemodAdapterId.YumCSS, CodemodAdapterId.Mui);
const tailwindToMui = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);
const reactSemantic = { source: { framework: BuiltinHostFramework.React } };
const muiYumCSSProject = createAdapterRouteProject(
	CodemodAdapterId.Mui,
	CodemodAdapterId.YumCSS,
	"#2563eb",
);

test("MUI sx spacing longhands, aliases, and gaps use the source theme scale", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ padding: 2, margin: 1, gap: 3, columnGap: 2, rowGap: 0.5, marginX: 1, paddingY: 0.5, marginInline: 1, paddingBlockStart: 0.5 }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

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
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ padding: "16px", margin: "8px", gap: "24px", columnGap: "16px", rowGap: "4px", marginLeft: "8px", marginRight: "8px", paddingTop: "4px", paddingBottom: "4px", marginInline: "8px", paddingBlockStart: "4px" })} />;"
	`);
});

test("MUI sx sizing and numeric borders become their CSS values", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ width: 0.5, maxWidth: 1, minHeight: 0.25, border: 1, borderTop: 2, borderRadius: 1 }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('width: "50%"');
	expect(result.code).toContain('maxWidth: "100%"');
	expect(result.code).toContain('minHeight: "25%"');
	expect(result.code).toContain('border: "1px solid"');
	expect(result.code).toContain('borderTop: "2px solid"');
	expect(result.code).toContain('borderRadius: "4px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ width: "50%", maxWidth: "100%", minHeight: "25%", border: "1px solid", borderTop: "2px solid", borderRadius: "4px" })} />;"
	`);
});

test("MUI sizing values above one become CSS pixel lengths", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box data-proof sx={{ width: 100, height: 100 }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('width: "100px"');
	expect(result.code).toContain('height: "100px"');
	expect(result.code).not.toContain("@mui/material");
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div data-proof className={css.class({ width: "100px", height: "100px" })} />;"
	`);
});

test("MUI numeric shadow tokens need the effective source theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

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
	expect(result.code).toContain("yumcss:migrate-skip");
	expect(result.code).toContain('sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }}');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <Box sx={{ boxShadow: 1, zIndex: "modal", maxWidth: "md" }} />;"
	`);
});

test("MUI typography tokens need the effective source theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ fontWeight: "medium", fontSize: "default", fontFamily: "default", typography: "body1" }} />;`;
	const legacySource = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ fontWeight: "fontWeightMedium", fontSize: "fontSize", fontFamily: "fontFamily" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });
	const legacyResult = muiToYumCSS.run({
		source: legacySource,
		file: "App.tsx",
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI fontWeight theme value 'medium'"),
			}),
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI fontSize theme value 'default'"),
			}),
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI fontFamily theme value 'default'"),
			}),
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI typography variant 'body1'"),
			}),
		]),
	);
	expect(result.code).toContain("yumcss:migrate-skip");
	expect(result.code).toContain('typography: "body1"');
	expect(legacyResult.converted).toBe(0);
	expect(legacyResult.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: "runtime-context", text: "fontWeightMedium" }),
			expect.objectContaining({ kind: "runtime-context", text: "fontSize" }),
			expect.objectContaining({ kind: "runtime-context", text: "fontFamily" }),
		]),
	);
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <Box sx={{ fontWeight: "medium", fontSize: "default", fontFamily: "default", typography: "body1" }} />;"
	`);
	expect(legacyResult.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <Box sx={{ fontWeight: "fontWeightMedium", fontSize: "fontSize", fontFamily: "fontFamily" }} />;"
	`);
});

test("MUI CSS keywords convert without a project theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ boxShadow: "none", zIndex: "auto", maxWidth: "max-content" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('boxShadow: "none"');
	expect(result.code).toContain('zIndex: "auto"');
	expect(result.code).toContain('maxWidth: "max-content"');
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ boxShadow: "none", zIndex: "auto", maxWidth: "max-content" })} />;"
	`);
});

test("MUI typography CSS keywords stay literal without a project theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ fontFamily: "monospace", fontSize: "small", fontWeight: "normal", fontStyle: "italic", lineHeight: "normal", letterSpacing: "normal", textTransform: "uppercase" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	for (const value of ["monospace", "small", "normal", "italic", "uppercase"])
		expect(result.code).toContain(value);
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ fontFamily: "monospace", fontSize: "small", fontWeight: "normal", fontStyle: "italic", lineHeight: "normal", letterSpacing: "normal", textTransform: "uppercase" })} />;"
	`);
});

test("MUI sx merges static object arrays", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={[{ color: "red", padding: 2 }, ({ margin: 1, color: "blue" })]} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).not.toContain('color: "red"');
	expect(result.code).toContain('color: "blue"');
	expect(result.code).toContain('padding: "16px"');
	expect(result.code).toContain('margin: "8px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ padding: "16px", margin: "8px", color: "blue" })} />;"
	`);
});

test("MUI sx theme callbacks remain typed runtime residuals", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={(theme) => ({ color: theme.palette.primary.main })} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining("MUI sx callbacks require effective theme evaluation"),
			}),
		]),
	);
	expect(result.code).toContain("theme.palette.primary.main");
	expect(result.code).toMatchInlineSnapshot(`
		"// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context)
		import { Box } from "@mui/material";
		export const App = () => <Box sx={(theme) => ({ color: theme.palette.primary.main })} />;"
	`);
});

test("MUI print display shorthand becomes a print media condition", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ display: "block", displayPrint: "none" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });
	const tailwindResult = muiToTailwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_print: { display: "none" }');
	expect(result.code).not.toContain("displayPrint");
	expect(tailwindResult.converted).toBe(1);
	expect(tailwindResult.residuals).toEqual([]);
	expect(tailwindResult.code).toContain("print:[display:none]");
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ display: "block", _print: { display: "none" } })} />;"
	`);
	expect(tailwindResult.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box className={"[display:block] print:[display:none]"}/>;"
	`);
});

test("MUI responsive sx needs the effective breakpoint theme", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ width: { xs: 0.5, md: 0.75 }, display: ["none", null, "flex"] }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });
	const tailwindResult = muiToTailwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining(
					"MUI responsive values need the effective source breakpoint theme",
				),
			}),
		]),
	);
	expect(result.code).toContain(
		'sx={{ width: { xs: 0.5, md: 0.75 }, display: ["none", null, "flex"] }}',
	);
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, target-native, residual)
		export const App = () => <Box sx={{ width: { xs: 0.5, md: 0.75 }, display: ["none", null, "flex"] }} />;"
	`);
	expect(tailwindResult.converted).toBe(0);
	expect(tailwindResult.skipped).toBe(1);
	expect(tailwindResult.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining(
					"MUI responsive values need the effective source breakpoint theme",
				),
			}),
		]),
	);
	expect(tailwindResult.code).toContain(
		'sx={{ width: { xs: 0.5, md: 0.75 }, display: ["none", null, "flex"] }}',
	);
});

test("MUI responsive sx resolves object and array breakpoints from the official theme", async () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ width: { mobile: 0.5, tablet: 0.75 }, display: ["none", null, "flex"] }} />;`;
	const breakpointValues = { mobile: 0, tablet: 700, desktop: 1200 };
	const root = "/mui-responsive-project";
	const themeFile = `${root}/src/theme.ts`;
	const moduleLoader: ProjectModuleLoader = {
		async importPackage(packageName) {
			return packageName === "@mui/system"
				? ({
						createTheme: (config: Record<string, unknown>) => ({
							...config,
							breakpoints: {
								values: breakpointValues,
								keys: Object.keys(breakpointValues),
								up: (key: string) =>
									`@media (min-width:${breakpointValues[key as keyof typeof breakpointValues]}px)`,
							},
						}),
					} as never)
				: undefined;
		},
		async importFile(file) {
			return file === themeFile
				? ({ default: { breakpoints: { values: breakpointValues } } } as never)
				: undefined;
		},
	};
	const project = {
		root,
		files: { [themeFile]: "export default { breakpoints: { values: {} } };" },
		moduleLoader,
		loaderCalls: { packages: [], files: [] },
	};
	const result = await muiToYumCSS.runAsync({
		source,
		file: "App.tsx",
		project,
		semantic: reactSemantic,
	});
	const tailwindResult = await muiToTailwind.runAsync({
		source,
		file: "App.tsx",
		project,
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("(min-width:700px)");
	expect(result.code).toContain('width: "50%"');
	expect(result.code).toContain('width: "75%"');
	expect(result.code).toContain('display: "flex"');
	expect(result.code).not.toContain("responsive values");
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ "@media (min-width:0px)": { width: "50%", display: "none" }, "@media (min-width:700px)": { width: "75%" }, "@media (min-width:1200px)": { display: "flex" } })} />;"
	`);
	expect(tailwindResult.converted).toBe(1);
	expect(tailwindResult.residuals).toEqual([]);
	expect(tailwindResult.code).toContain("min-width:700px");
	expect(tailwindResult.code).toContain("width:75%");
	expect(tailwindResult.code).toContain("display:flex");
	expect(tailwindResult.code).not.toContain("mobile:");
	expect(tailwindResult.code).not.toContain("tablet:");
	expect(tailwindResult.code).not.toContain("desktop:");
	expect(tailwindResult.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box className={"[@media_(min-width:0px)]:[width:50%] [@media_(min-width:700px)]:[width:75%] [@media_(min-width:0px)]:[display:none] [@media_(min-width:1200px)]:[display:flex]"}/>;"
	`);
});

test("Tailwind media variants become MUI media queries", async () => {
	const source = `export const App = () => <div className="md:[display:flex]" />;`;
	const project = createAdapterRouteProject(
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.Mui,
		"#2563eb",
	);
	const result = await tailwindToMui.runAsync({
		source,
		file: "App.tsx",
		project,
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("@media");
	expect(result.code).toContain("48rem");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box component="div" sx={{ "@media (width >= 48rem)": { display: "flex" } }} />;"
	`);
});

test("MUI styled declarations preserve component shape and plain CSS semantics", () => {
	const source = `import { styled } from "@mui/system";
export const Card = styled("div")({ padding: 2 });
export const Panel = styled("section")({ margin: 3 });`;
	const result = muiToYumCSS.run({
		source,
		file: "Card.tsx",
		project: muiYumCSSProject,
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(2);
	expect(result.code).toContain("export const Card = __yumcssSlot(");
	expect(result.code).toContain("export const Panel = __yumcssSlot(");
	expect(result.code.match(/__yumcssSlot\(/gu)).toHaveLength(2);
	expect(result.code).not.toContain("export const Card = css.class");
	expect(result.code).toContain('from "./__yumcss/slot"');
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles?.map((file) => file.path)).toContain("__yumcss/slot.tsx");
	expect(
		result.generatedFiles?.find((file) => file.path === "__yumcss/slot.tsx")?.content,
	).toContain("forwardRef");
	expect(result.generatedFiles?.find((file) => file.path === "__yumcss/slot.tsx")?.content)
		.toMatchInlineSnapshot(`
		"import { createElement, forwardRef } from "react";
		import type { ComponentPropsWithoutRef, ComponentRef, CSSProperties, ElementType, ReactElement, Ref } from "react";

		type YumCSSSlotTransientProps<Prefix extends string> = {
			readonly [key in \`\${Prefix}\${string}\`]?: unknown;
		};
		type YumCSSSlotProps<Component extends ElementType, Prefix extends string> = Omit<ComponentPropsWithoutRef<Component>, "as" | "className"> & YumCSSSlotTransientProps<Prefix> & {
			readonly as?: Component;
			readonly className?: string;
			readonly ref?: Ref<ComponentRef<Component>>;
		};
		type YumCSSSlotComponent<DefaultComponent extends ElementType, Prefix extends string> = <Component extends ElementType = DefaultComponent>(
			props: YumCSSSlotProps<Component, Prefix>,
		) => ReactElement | null;
		type YumCSSSlotRuntimeProps = Record<string, unknown> & {
			readonly as?: ElementType;
			readonly className?: string;
			readonly style?: CSSProperties;
		};
		type YumCSSSlotOptions<DefaultComponent extends ElementType, Prefix extends string> = {
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
		const isYumCSSSlotElementType = (value: unknown): value is ElementType =>
			typeof value === "string" ||
			typeof value === "function" ||
			typeof value === "symbol" ||
			(typeof value === "object" && value !== null);

		export const __yumcssSlot = <DefaultComponent extends ElementType, Prefix extends string = never>({
			defaultComponent,
			style,
			stableClass,
			inheritedClass,
			classAttribute,
			filteredPropPrefixes,
			attrs,
			joinClass,
		}: YumCSSSlotOptions<DefaultComponent, Prefix>) => {
			const component = forwardRef<unknown, YumCSSSlotRuntimeProps>((props, ref) => {
				const Component = isYumCSSSlotElementType(props.as) ? props.as : defaultComponent;
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
			return Object.assign(component as unknown as YumCSSSlotComponent<DefaultComponent, Prefix>, {
				__yumcssClassName: stableClass,
			});
		};
		"
	`);
	expect(result.code).toContain("padding: 2");
	expect(result.code).not.toContain('padding: "16px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/system";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		import { createCx } from "yumcss/cx";
		import { __yumcssSlot } from "./__yumcss/slot";
		const cx = createCx();
		const css = createUnsafeCss();
		export const Card = __yumcssSlot({ defaultComponent: "div", style: css.class({ padding: 2 }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });
		export const Panel = __yumcssSlot({ defaultComponent: "section", style: css.class({ margin: 3 }), stableClass: "pw-1yrm3hy", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });"
	`);
});

test("MUI Box component prop becomes the same intrinsic host", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box component="section" sx={{ color: "red" }} />;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("<section");
	expect(result.code).not.toContain('component="section"');
	expect(result.code).toMatchInlineSnapshot(`
		"import "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <section className={css.class({ color: "red" })} />;"
	`);
});

test("MUI component behavior survives style extraction", () => {
	const source = `import { Button } from "@mui/material";
export const App = () => <Button variant="contained" size="large" sx={{ p: 2 }}>Save</Button>;`;
	const result = muiToYumCSS.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.code).toContain("<Button");
	expect(result.code).toContain('variant="contained"');
	expect(result.code).toContain('size="large"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Button } from "@mui/material";
		import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <Button variant="contained" size="large" className={css.class({ padding: "16px" })}>Save</Button>;"
	`);
});

test("YumCSS numeric CSS values stay literal in MUI sx", () => {
	const source = `import { createUnsafeCss } from "yumcss/unsafe/css";
const css = createUnsafeCss();
const card = css.class({ padding: 4, width: 0.5, height: 1, borderRadius: 1, fontSize: 14, letterSpacing: 0.5 });
export const App = () => <div className={card} />;`;
	const result = yumcssToMui.run({ source, file: "App.tsx", semantic: reactSemantic });

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
	const source = `import { createUnsafeCss } from "yumcss/unsafe/css";
const css = createUnsafeCss();
export const card = css.class({ color: "red", padding: "4px" });`;
	const result = yumcssToMui.run({ source, file: "styles.ts" });

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
	expect(result.code).toContain("yumcss:migrate-skip");
	expect(result.code).toContain('css.class({ color: "red", padding: "4px" })');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		// yumcss:migrate-skip (route: yumcss -> mui | lowering-residual: host-framework | available: static, named-map, residual)
		export const card = css.class({ color: "red", padding: "4px" });"
	`);
});

test("MUI runtime themes remain explicit residuals", () => {
	const styledSource = `import { styled } from "@mui/system";
export const Card = styled("div")((theme) => ({ color: theme.palette.primary.main }));`;
	const providerSource = `import { ThemeProvider } from "@mui/material/styles";
export const App = () => <ThemeProvider theme={theme}><main /></ThemeProvider>;`;
	const styledResult = muiToYumCSS.run({
		source: styledSource,
		file: "Card.tsx",
		semantic: reactSemantic,
	});
	const providerResult = muiToYumCSS.run({
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
		expect(result.code).toContain("yumcss:migrate-skip");
	}
	expect(styledResult.code).toContain(
		'styled("div")((theme) => ({ color: theme.palette.primary.main }))',
	);
	expect(providerResult.code).toContain("<ThemeProvider theme={theme}>");
	expect({ styled: styledResult.code, provider: providerResult.code }).toMatchInlineSnapshot(`
		{
		  "provider": "// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		import { ThemeProvider } from "@mui/material/styles";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const App = () => <ThemeProvider theme={theme}><main /></ThemeProvider>;",
		  "styled": "import { styled } from "@mui/system";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const Card = styled("div")((theme) => ({ color: theme.palette.primary.main }));",
		}
	`);
});

test("MUI theme component overrides and variants stay visible as residuals", () => {
	const source = `import { createTheme } from "@mui/material/styles";
export const theme = createTheme({
	components: {
		MuiButton: {
			styleOverrides: { root: { borderRadius: 8 } },
			variants: [{ props: { variant: "dashed" }, style: { border: "2px dashed" } }],
		},
	},
});`;
	const result = muiToYumCSS.run({ source, file: "theme.ts" });
	const tailwindResult = muiToTailwind.run({ source, file: "theme.ts" });

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining(
					"MUI theme component overrides and variants require component-theme lowering",
				),
			}),
		]),
	);
	expect(result.code).toContain("styleOverrides: { root: { borderRadius: 8 } }");
	expect(result.code).toContain('variant: "dashed"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createTheme } from "@mui/material/styles";
		// yumcss:migrate-skip (route: mui -> yumcss | parse-residual: runtime-context | available: named-map, residual)
		export const theme = createTheme({
			components: {
				MuiButton: {
					styleOverrides: { root: { borderRadius: 8 } },
					variants: [{ props: { variant: "dashed" }, style: { border: "2px dashed" } }],
				},
			},
		});"
	`);
	expect(tailwindResult.converted).toBe(0);
	expect(tailwindResult.skipped).toBeGreaterThan(0);
	expect(tailwindResult.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "runtime-context",
				hint: expect.stringContaining(
					"MUI theme component overrides and variants require component-theme lowering",
				),
			}),
		]),
	);
	expect(tailwindResult.code).toContain("styleOverrides: { root: { borderRadius: 8 } }");
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
		// yumcss:migrate-skip (route: mui -> tailwind | parse-residual: runtime-context | available: named-map, residual)
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
