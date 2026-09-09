import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import { examplePreset } from "@pandwind/example-preset";
import { loadMetaFromSources } from "../src/meta.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	createBuiltinCodemodCatalog,
	PANDA_STYLE_SYSTEM,
	PANDWIND_STYLE_SYSTEM,
	STYLE_MIGRATION_USE_CASE,
	AdapterEvidence,
	AdapterOfficialApiStatusTag,
	asStyleDialect,
	createStyleSystem,
	createStyleSystemRegistry as registry,
	getCodemodAdapter,
} from "../src/swap/index.ts";
import { CodemodAdapterId, SwapSourceId } from "../src/swap/identifiers.ts";

const stub = (id: string) => ({
	schema: ADAPTER_CONTRACT_SCHEMA,
	id,
	version: "2",
	sourceModules: [],
	capabilities: {
		schema: "pandwind.adapter-capabilities/2" as const,
		adapter: id,
		capabilities: {},
	},
	dependencies: { packages: [] },
	officialApi: AdapterEvidence.manifest({
		apis: [{ name: id, status: AdapterOfficialApiStatusTag.Supported }],
	}),
	detect: () => ({ matched: true, confidence: 1, evidence: [id] }),
	loadConfig: () => ({ adapter: id, files: [], values: {} }),
	parse: () => ({ matches: [], residuals: [] }),
	emit: () => ({ text: "", residuals: [] }),
	validate: () => ({
		valid: true,
		lossiness: "lossless" as const,
		canonicalSource: "",
		canonicalTarget: "",
		differences: [],
		residuals: [],
	}),
});

const exampleRoot = resolve(import.meta.dirname, "../../../examples/example/src");
const exampleMeta = loadMetaFromSources({
	typesDtsPath: resolve(exampleRoot, "types.d.ts"),
	twTsPath: resolve(exampleRoot, "tw.ts"),
	bridgePath: resolve(exampleRoot, "bridge.ts"),
	tokens: examplePreset.tokens,
});

describe("style system and dialect registry", () => {
	test("routes a newly registered dialect without changing orchestration", () => {
		const source = asStyleDialect(stub("panda-dss"), {
			system: "panda",
			dialect: "dss",
			role: "source",
		});
		const target = asStyleDialect(stub("pandwind-css"), {
			system: "pandwind",
			dialect: "css",
			role: "target",
		});
		const systems = registry([
			createStyleSystem("panda", [source]),
			createStyleSystem("pandwind", [target]),
		]);
		const route = systems.resolveRoute(
			{ system: "panda", dialect: "dss" },
			{ system: "pandwind", dialect: "css" },
		);
		expect(route.source).toBe(source);
		expect(route.target).toBe(target);
	});

	test("keeps the existing external adapter API as a projection of the registry", () => {
		const catalog = createBuiltinCodemodCatalog();
		expect(catalog.registry.getDialect("emotion")?.system).toBe("emotion");
		expect(getCodemodAdapter("linaria")?.id).toBe("linaria");
		expect(catalog.registry.getDialect("panda")?.id).toBe("panda");
		expect(catalog.registry.getDialect("pandwind")?.id).toBe("pandwind");
		expect(catalog.registry.systems.length).toBeGreaterThanOrEqual(7);
	});

	test("projects core dialects and modern adapters through one route registry", () => {
		const catalog = createBuiltinCodemodCatalog();
		const pandaToPandwind = catalog.registry.resolveRoute("panda", "pandwind");
		const pandaTwToPandwindCss = catalog.registry.resolveRoute(
			{ system: "panda", dialect: "tw" },
			{ system: "pandwind", dialect: "css" },
		);
		expect(pandaToPandwind.source.id).toBe("panda");
		expect(pandaToPandwind.target.id).toBe("pandwind");
		expect(pandaTwToPandwindCss.source.id).toBe("panda:tw");
		expect(pandaTwToPandwindCss.target.id).toBe("pandwind:css");
	});

	test("registers Panda's nested dialects and Pandwind's target dialects", () => {
		expect(PANDA_STYLE_SYSTEM.dialects.map((dialect) => dialect.dialect)).toEqual([
			"tw",
			"dss",
			"css",
		]);
		expect(PANDWIND_STYLE_SYSTEM.dialects.map((dialect) => dialect.dialect)).toEqual([
			"tw",
			"dss",
			"css",
		]);
		expect(
			createBuiltinCodemodCatalog().registry.resolveRoute(
				{ system: "panda", dialect: "tw" },
				{ system: "pandwind", dialect: "dss" },
			).target.id,
		).toBe("pandwind:dss");
	});

	test("executes the nested Pandwind dialect ports independently", () => {
		const css = PANDWIND_STYLE_SYSTEM.dialects.find((dialect) => dialect.dialect === "css")!;
		const tw = PANDWIND_STYLE_SYSTEM.dialects.find((dialect) => dialect.dialect === "tw")!;
		const dss = PANDWIND_STYLE_SYSTEM.dialects.find((dialect) => dialect.dialect === "dss")!;
		const cssSource = 'css.class({ color: "red" })';
		const cssConfig = css.loadConfig({ file: "Card.tsx", source: cssSource });
		const parsedCss = css.parse(cssSource, {
			file: "Card.tsx",
			source: cssSource,
			config: cssConfig,
			meta: exampleMeta,
		});
		expect(parsedCss.matches).toHaveLength(1);
		expect(css.validate(parsedCss.matches[0]!.program, parsedCss.matches[0]!.program).valid).toBe(
			true,
		);

		const twSource = 'tw({ bgColor: "blue-500" })';
		const twConfig = tw.loadConfig({ file: "Card.tsx", source: twSource });
		const parsedTw = tw.parse(twSource, {
			file: "Card.tsx",
			source: twSource,
			config: twConfig,
			meta: exampleMeta,
		});
		expect(parsedTw.matches).toHaveLength(1);
		const emittedTw = tw.emit(parsedTw.matches[0]!.program, {
			file: "Card.tsx",
			config: twConfig,
			mode: "partial",
			index: 0,
			meta: exampleMeta,
		});
		expect(emittedTw.text).toContain("tw({");

		const dssSource = 'dss({ $frame: { fill: "$blue-500" } })';
		const dssConfig = dss.loadConfig({ file: "Card.tsx", source: dssSource });
		const parsedDss = dss.parse(dssSource, {
			file: "Card.tsx",
			source: dssSource,
			config: dssConfig,
			meta: exampleMeta,
		});
		expect(parsedDss.matches).toHaveLength(1);
	});

	test("uses a project-owned dss module for the core design target", async () => {
		const result = await STYLE_MIGRATION_USE_CASE.runAsync(
			'import { css } from "@emotion/css";\nconst card = css({ color: "#3182ce" });',
			{
				from: CodemodAdapterId.Emotion,
				to: `${CodemodAdapterId.Pandwind}:${SwapSourceId.Dss}`,
				file: "src/Card.tsx",
				root: "/project",
				mode: "safe",
				meta: exampleMeta,
				project: { dssModule: "pandwind/dss.ts" },
			},
		);
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { dss } from "../pandwind/dss.ts";');
		expect(result.code).toContain("dss(");
	});

	test("uses a project-owned css module for the core css target", async () => {
		const result = await STYLE_MIGRATION_USE_CASE.runAsync(
			'import { css } from "@emotion/css";\nconst card = css({ color: "#3182ce" });',
			{
				from: CodemodAdapterId.Emotion,
				to: `${CodemodAdapterId.Pandwind}:${SwapSourceId.Css}`,
				file: "src/Card.tsx",
				root: "/project",
				mode: "safe",
				meta: exampleMeta,
				project: { cssModule: "pandwind/css.ts" },
			},
		);
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css } from "../pandwind/css.ts";');
		expect(result.code).toContain("css.class(");
	});
});
