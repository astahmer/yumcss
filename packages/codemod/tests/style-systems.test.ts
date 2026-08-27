import { describe, expect, test } from "vitest";
import {
	ADAPTER_CONTRACT_SCHEMA,
	createBuiltinCodemodCatalog,
	PANDA_STYLE_SYSTEM,
	PANDWIND_STYLE_SYSTEM,
	STYLE_SYSTEMS,
	asStyleDialect,
	createStyleSystem,
	createStyleSystemRegistry as registry,
	getCodemodAdapter,
} from "../src/swap/index.ts";

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
		expect(catalog.systems.getDialect("emotion")?.system).toBe("emotion");
		expect(getCodemodAdapter("linaria")?.id).toBe("linaria");
		expect(catalog.systems.systems.length).toBeGreaterThanOrEqual(7);
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
			STYLE_SYSTEMS.resolveRoute(
				{ system: "panda", dialect: "tw" },
				{ system: "pandwind", dialect: "dss" },
			).target.id,
		).toBe("pandwind:dss");
	});
});
