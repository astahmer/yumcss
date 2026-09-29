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

test("MUI styled declarations preserve component shape and plain CSS semantics", () => {
	const source = `import { styled } from "@mui/system";
export const Card = styled("div")({ padding: 2 });`;
	const result = muiToPandwind.run({
		source,
		file: "Card.tsx",
		project: muiPandwindProject,
		semantic: reactSemantic,
	});

	expect(result.converted).toBe(1);
	expect(result.code).toContain("export const Card = __pandwindSlot(");
	expect(result.code).not.toContain("export const Card = css.class");
	expect(result.code).toContain('from "./__pandwind/slot"');
	expect(result.generatedFiles?.map((file) => file.path)).toContain("__pandwind/slot.tsx");
	expect(
		result.generatedFiles?.find((file) => file.path === "__pandwind/slot.tsx")?.content,
	).toContain("forwardRef");
	expect(result.code).toContain("padding: 2");
	expect(result.code).not.toContain('padding: "16px"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "pandwind/unsafe/css";
		import { createCx } from "pandwind/cx";
		import { __pandwindSlot } from "./__pandwind/slot";
		const cx = createCx();
		const css = createUnsafeCss();
		export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ padding: 2 }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });"
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

test("standalone styles convert to reusable MUI sx objects", () => {
	const source = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export const card = css.class({ color: "red", padding: "4px" });`;
	const result = pandwindToMui.run({ source, file: "styles.ts" });

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('export const card = { color: "red", padding: "4px" }');
	expect(result.code).not.toContain("pandwind/unsafe/css");
	expect(result.code).not.toContain("css.class");
	expect(result.code).toMatchInlineSnapshot(`
		""
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
