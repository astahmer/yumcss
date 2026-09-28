import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	expectConfiguredProjectEvidence,
	expectConfiguredTargetTokenEvidence,
} from "./route-spec-support.ts";

const tailwindToMui = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);

test("Tailwind to MUI wraps intrinsic hosts and rewrites their closing tags", () => {
	const result = tailwindToMui.run({
		source: 'export const App = () => <div className="[display:flex]">content</div>;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('import { Box } from "@mui/material";');
	expect(result.code).toContain('<Box component="div" sx={{ display: "flex" }}>content</Box>');
	expect(result.code).not.toMatch(/<div\b[^>]*\bsx=/u);
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box component="div" sx={{ display: "flex" }}>content</Box>;"
	`);
});

test("Tailwind to MUI avoids a Box binding collision when wrapping intrinsic hosts", () => {
	const result = tailwindToMui.run({
		source: 'const Box = () => null;\nexport const App = () => <div className="[display:flex]" />;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { Box as MuiBox } from "@mui/material";');
	expect(result.code).toContain('<MuiBox component="div" sx={{ display: "flex" }} />');
	expect(result.code).toContain("const Box = () => null;");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box as MuiBox } from "@mui/material";
		const Box = () => null;
		export const App = () => <MuiBox component="div" sx={{ display: "flex" }} />;"
	`);
});

test("Tailwind to MUI reuses an existing MUI Box import for intrinsic hosts", () => {
	const result = tailwindToMui.run({
		source:
			'import { Box } from "@mui/material";\n' +
			'export const App = () => <div className="[display:flex]" />;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('<Box component="div" sx={{ display: "flex" }} />');
	expect(result.code).not.toContain("Box as MuiBox");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box component="div" sx={{ display: "flex" }} />;"
	`);
});

test("Tailwind to MUI uses sx on an imported MUI component", () => {
	const result = tailwindToMui.run({
		source:
			'import { Button } from "@mui/material";\n' +
			'export const App = () => <Button className="[color:rebeccapurple]" />;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('<Button sx={{ color: "rebeccapurple" }} />');
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain('import { Box } from "@mui/material";');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Button } from "@mui/material";
		export const App = () => <Button sx={{ color: "rebeccapurple" }} />;"
	`);
});

test("Tailwind to MUI recognizes default imports from component subpaths", () => {
	const result = tailwindToMui.run({
		source:
			'import MuiButton from "@mui/material/Button";\n' +
			'export const App = () => <MuiButton className="[color:rebeccapurple]" />;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('<MuiButton sx={{ color: "rebeccapurple" }} />');
	expect(result.code).not.toContain('import { Box } from "@mui/material";');
	expect(result.code).toMatchInlineSnapshot(`
		"import MuiButton from "@mui/material/Button";
		export const App = () => <MuiButton sx={{ color: "rebeccapurple" }} />;"
	`);
});

test("Tailwind to MUI maps exact target tokens and retains raw spacing values", async () => {
	const project = createAdapterRouteProject(
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.Mui,
		"#2563eb",
	);
	const result = await tailwindToMui.runAsync({
		source: 'export const App = () => <div className="text-brand bg-brand p-card" />;',
		file: "App.tsx",
		project,
	});

	expectConfiguredProjectEvidence(project, CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);
	expectConfiguredTargetTokenEvidence(result, CodemodAdapterId.Mui, "Tailwind to MUI token audit");
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('color: "primary.main"');
	expect(result.code).toContain('backgroundColor: "primary.main"');
	expect(result.code).toContain('padding: "1.125rem"');
	expect(result.code).not.toContain('padding: "card"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box component="div" sx={{ padding: "1.125rem", backgroundColor: "primary.main", color: "primary.main" }} />;"
	`);
});

test("Tailwind to MUI resolves responsive conditions from the official Tailwind graph", async () => {
	const project = createAdapterRouteProject(
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.Mui,
		"#2563eb",
	);
	const result = await tailwindToMui.runAsync({
		source: 'export const App = () => <div className="md:[display:flex]" />;',
		file: "App.tsx",
		project,
	});

	expectConfiguredProjectEvidence(project, CodemodAdapterId.Tailwind, CodemodAdapterId.Mui);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('"@media (width >= 48rem)"');
	expect(result.code).toContain('<Box component="div"');
	expect(result.code).not.toContain('className="md:[display:flex]"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box component="div" sx={{ "@media (width >= 48rem)": { display: "flex" } }} />;"
	`);
});

test("Tailwind to MUI merges plain object sx values with the original precedence", () => {
	const result = tailwindToMui.run({
		source:
			'import { Box } from "@mui/material";\n' +
			'export const App = () => <Box sx={{ padding: 2, color: "blue" }} className="[color:rebeccapurple]" />;',
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('sx={[{ color: "rebeccapurple" }, { padding: 2, color: "blue" }]}');
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box sx={[{ color: "rebeccapurple" }, { padding: 2, color: "blue" }]} />;"
	`);
});

test("Tailwind to MUI keeps dynamic sx values as typed residuals", () => {
	const source =
		'import { Box } from "@mui/material";\n' +
		'export const App = () => <Box sx={resolveSx()} className="[color:rebeccapurple]" />;';
	const result = tailwindToMui.run({ source, file: "App.tsx" });

	expect(result.residuals).toEqual([
		expect.objectContaining({
			kind: "host-framework",
			hint: expect.stringContaining("plain object-literal sx value"),
		}),
	]);
	expect(result.code).toContain('sx={resolveSx()} className="[color:rebeccapurple]"');
	expect(result.code).not.toContain('sx={[{ color: "rebeccapurple" }, resolveSx()]}');
	expect(result.code).toMatchInlineSnapshot(`
		"import { Box } from "@mui/material";
		export const App = () => <Box sx={resolveSx()} className="[color:rebeccapurple]" />;"
	`);
});
