import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	createInstalledTailwindChakraRouteProject,
	expectConfiguredProjectEvidence,
} from "./route-spec-support.ts";

const tailwindToFela = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.Fela);
const tailwindToChakra = createAdapterRouteSpec(
	CodemodAdapterId.Tailwind,
	CodemodAdapterId.ChakraUi,
);

test("Tailwind to Fela resolves responsive conditions from the official Tailwind graph", async () => {
	const project = createAdapterRouteProject(
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.Fela,
		"#2563eb",
	);
	const result = await tailwindToFela.runAsync({
		source: 'export const App = () => <div className="md:[display:flex]" />;',
		file: "App.tsx",
		project,
	});

	expectConfiguredProjectEvidence(project, CodemodAdapterId.Tailwind, CodemodAdapterId.Fela);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('"@media (width >= 48rem)"');
	expect(result.code).not.toContain('className="md:[display:flex]"');
	expect(result.code).toMatchInlineSnapshot(
		`"export const App = () => renderer.renderRule({ "@media (width >= 48rem)": { "display": "flex" } });"`,
	);
});

test("Tailwind to Chakra removes responsive residuals when both official config graphs resolve them", async () => {
	const project = createInstalledTailwindChakraRouteProject();
	const result = await tailwindToChakra.runAsync({
		source: 'export const App = () => <div className="md:[display:flex]" />;',
		file: "App.tsx",
		project,
	});

	expectConfiguredProjectEvidence(project, CodemodAdapterId.Tailwind, CodemodAdapterId.ChakraUi);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.validations[0]).toMatchObject({
		valid: true,
		lossiness: "lossless",
		differences: [],
	});
	expect(result.code).toContain('"@media (width >= 48rem)"');
	expect(result.code).not.toContain('className="md:[display:flex]"');
	expect(result.code).toMatchInlineSnapshot(`
		"import { chakra } from "@chakra-ui/react";
		export const App = () => <chakra.div  css={{ "@media (width >= 48rem)": { display: "flex" } }}/>;"
	`);
});
