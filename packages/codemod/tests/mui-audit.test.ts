import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteSpec } from "./route-spec-support.ts";

const muiToPandwind = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.Pandwind);
const muiToTailwind = createAdapterRouteSpec(CodemodAdapterId.Mui, CodemodAdapterId.Tailwind);
const pandwindToMui = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.Mui);
const tailwindToMui = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);
const reactSemantic = { source: { framework: BuiltinHostFramework.React } };

test("MUI sx spacing longhands, aliases, and gaps use the source theme scale", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ padding: 2, margin: 1, gap: 3, marginX: 1, paddingY: 0.5 }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('padding: "16px"');
	expect(result.code).toContain('margin: "8px"');
	expect(result.code).toContain('gap: "24px"');
	expect(result.code).toContain('marginLeft: "8px"');
	expect(result.code).toContain('marginRight: "8px"');
	expect(result.code).toContain('paddingTop: "4px"');
	expect(result.code).toContain('paddingBottom: "4px"');
	expect(result.code).toMatchInlineSnapshot();
});

test("MUI styled declarations keep CSS semantics instead of sx transforms", () => {
	const source = `import { styled } from "@mui/system";
export const Card = styled("div")({ p: 2, padding: 2 });`;
	const result = muiToPandwind.run({ source, file: "Card.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.code).toContain("p: 2");
	expect(result.code).toContain("padding: 2");
	expect(result.code).not.toContain('padding: "16px"');
	expect(result.code).toMatchInlineSnapshot();
});

test("MUI Box component prop becomes the same intrinsic host", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box component="section" sx={{ color: "red" }} />;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("<section");
	expect(result.code).not.toContain('component="section"');
	expect(result.code).toMatchInlineSnapshot();
});

test("MUI component behavior survives style extraction", () => {
	const source = `import { Button } from "@mui/material";
export const App = () => <Button variant="contained" size="large" sx={{ p: 2 }}>Save</Button>;`;
	const result = muiToPandwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.code).toContain("<Button");
	expect(result.code).toContain('variant="contained"');
	expect(result.code).toContain('size="large"');
	expect(result.code).toMatchInlineSnapshot();
});

test("Pandwind numeric CSS values stay literal in MUI sx", () => {
	const source = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const card = css.class({ padding: 4, width: 0.5, borderRadius: 1 });
export const App = () => <div className={card} />;`;
	const result = pandwindToMui.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('padding: "4px"');
	expect(result.code).toContain('width: "0.5px"');
	expect(result.code).toContain('borderRadius: "1px"');
	expect(result.code).toMatchInlineSnapshot();
});

test("standalone styles remain residual when MUI has no host to receive sx", () => {
	const source = `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export const card = css.class({ color: "red", padding: "1rem" });`;
	const result = pandwindToMui.run({ source, file: "styles.ts" });

	expect(result.converted).toBe(0);
	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.code).toContain("pandwind:migrate-skip");
	expect(result.code).toMatchInlineSnapshot();
});

test("unresolved MUI sx theme paths do not invent CSS variables", () => {
	const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ color: "brand.main" }} />;`;
	const result = muiToTailwind.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.code).toContain('color: "brand.main"');
	expect(result.code).not.toContain("var(--mui-");
	expect(result.code).toMatchInlineSnapshot();
});

test("generated MUI Box aliases close with the same JSX binding", () => {
	const source = `const Box = () => null;
export const App = () => <div className="[color:red]"><Box /></div>;`;
	const result = tailwindToMui.run({ source, file: "App.tsx", semantic: reactSemantic });

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { Box as MuiBox } from "@mui/material";');
	expect(result.code).toContain("</MuiBox>");
	expect(result.code).not.toContain("</Box>");
	expect(result.code).toMatchInlineSnapshot();
});
