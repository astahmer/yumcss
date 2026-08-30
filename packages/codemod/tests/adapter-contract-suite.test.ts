import { describe, expect, test } from "vitest";
import {
	AdapterContractSuite,
	AdapterCoverageSuite,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	requiredAdapterCapabilities,
} from "../src/swap/index.ts";

const adapterFixtures: Readonly<Record<string, string>> = {
	[CodemodAdapterId.Pandwind]: `css.class({ color: "red" });`,
	[CodemodAdapterId.Bamboo]: `css({ color: "red" });`,
	[CodemodAdapterId.ChakraUi]: `<Box color="red" />`,
	[CodemodAdapterId.Emotion]: `css({ color: "red" });`,
	[CodemodAdapterId.StyledComponents]: `styled.div({ color: "red" });`,
	[CodemodAdapterId.VanillaExtract]: `style({ color: "red" });`,
	[CodemodAdapterId.Stitches]: `css({ color: "red" });`,
	[CodemodAdapterId.Linaria]: "css`color: red;`",
	[CodemodAdapterId.Mantine]: `<Box sx={{ color: "red" }} />`,
	[CodemodAdapterId.Mui]: `<Box sx={{ color: "red" }} />`,
	[CodemodAdapterId.NextYak]: "css`color: red;`",
	[CodemodAdapterId.Jss]: `createStyleSheet({ button: { color: "red" } });`,
	[CodemodAdapterId.StyleX]: `stylex.create({ button: { color: "red" } });`,
	[CodemodAdapterId.Fela]: `renderer.renderRule({ color: "red" });`,
	[CodemodAdapterId.Goober]: `css({ color: "red" });`,
	[CodemodAdapterId.Aphrodite]: `StyleSheet.create({ button: { color: "red" } });`,
	[CodemodAdapterId.Style9]: `style9.create({ button: { color: "red" } });`,
	[CodemodAdapterId.Treat]: `style({ color: "red" });`,
	[CodemodAdapterId.Compiled]: `css({ color: "red" });`,
	[CodemodAdapterId.SolidStyled]: "styled.div`color: red;`",
	[CodemodAdapterId.VueStyled]: "styled.div`color: red;`",
	[CodemodAdapterId.ReactNative]: `StyleSheet.create({ button: { color: "red" } });`,
};

describe("adapter contract suite", () => {
	test("all registered adapters satisfy the shared lifecycle contract", () => {
		const reports = AdapterContractSuite.inspectRegistry(createBuiltinCodemodCatalog().registry);
		for (const report of reports) AdapterContractSuite.assert(report);
		expect(reports.every((report) => report.valid)).toBe(true);
	});

	test("a minimal third-party adapter uses the same conformance boundary", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get("emotion");
		expect(adapter).toBeDefined();
		const report = AdapterContractSuite.inspect(adapter!);
		expect(report).toMatchObject({ valid: true, adapter: "emotion" });
	});

	test("every built-in adapter has a real parse and emit fixture", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		for (const adapter of registry.adapters) {
			const source = adapterFixtures[adapter.id];
			expect(source, `${adapter.id} fixture is missing`).toBeDefined();
			if (source === undefined) throw new Error(`${adapter.id} fixture is missing`);
			const report = AdapterContractSuite.inspect(adapter, {
				file: "fixture.tsx",
				source,
			});
			AdapterContractSuite.assert(report);
			const config = adapter.loadConfig({ file: "fixture.tsx", source });
			const parsed = adapter.parse(source, { file: "fixture.tsx", source, config });
			expect(parsed.matches, `${adapter.id} fixture did not produce a match`).not.toHaveLength(0);
			for (const match of parsed.matches) {
				for (const requirement of requiredAdapterCapabilities(match.program)) {
					expect(
						adapter.capabilities.capabilities[requirement.capability],
						`${adapter.id} fixture requires ${requirement.capability}`,
					).not.toBe("unsupported");
				}
			}
		}
	});

	test("the registry cannot add an adapter without capability coverage", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		const probes = new Map(
			Object.entries(adapterFixtures).map(([adapter, source]) => [
				adapter,
				{ file: "fixture.tsx", source },
			]),
		);
		const reports = AdapterCoverageSuite.inspectRegistry(registry, probes);
		for (const report of reports) AdapterCoverageSuite.assert(report);
		expect(reports.every((report) => report.matches > 0)).toBe(true);
		expect(reports.every((report) => report.exercisedCapabilities.length > 0)).toBe(true);
	});
});
