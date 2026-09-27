import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";
import type { AdapterParseContext } from "../src/swap/adapter-contract.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	requireBuiltinAdapterId,
} from "./route-spec-support.ts";

const catalog = createBuiltinCodemodCatalog();
const pandwind = CodemodAdapterId.Pandwind;
const fixtures = new Map(adapterContractFixtures.map((fixture) => [fixture.adapter, fixture]));

function semanticFor(adapter: string): AdapterParseContext["semantic"] | undefined {
	if (adapter === CodemodAdapterId.StyledComponents) return { source: { framework: "react" } };
	if (adapter === CodemodAdapterId.SolidStyled) return { source: { framework: "solid" } };
	if (adapter === CodemodAdapterId.VueStyled) return { source: { framework: "vue" } };
	if (
		adapter === CodemodAdapterId.ChakraUi ||
		adapter === CodemodAdapterId.Mui ||
		adapter === CodemodAdapterId.Mantine
	)
		return { source: { framework: "react" } };
	return undefined;
}

function edgeSource(adapter: string, source: string): { source: string; expression?: string } {
	if (source.includes("'red'"))
		return {
			source: source.replaceAll("'red'", "theme.foreground"),
			expression: "theme.foreground",
		};
	if (source.includes('"red"'))
		return {
			source: source.replaceAll('"red"', "theme.foreground"),
			expression: "theme.foreground",
		};
	if (source.includes("color: red"))
		return {
			source: source.replaceAll("color: red", "color: ${theme.foreground}"),
			expression: "theme.foreground",
		};
	if (source.includes("bg='tomato'"))
		return {
			source: source.replace("bg='tomato'", "bg={theme.foreground}"),
			expression: "theme.foreground",
		};
	if (adapter === CodemodAdapterId.UnoCSS)
		return { source: "<div className={theme.foreground} />", expression: "theme.foreground" };
	return { source: `${source}\nconst broken =`, expression: undefined };
}

function migrate(source: string, from: string, to: string, file: string) {
	return runAdapterMigration(source, {
		from,
		to,
		file,
		adapterRegistry: catalog.registry,
		readFile: () => undefined,
		mode: "safe",
		...(semanticFor(from) === undefined ? {} : { semantic: semanticFor(from) }),
	});
}

const migrateChakra = (source: string, targetId: string, file: string) => {
	const target = fixtures.get(targetId);
	if (target === undefined) throw new Error(`missing fixture for ${targetId}`);
	const targetAdapterId = requireBuiltinAdapterId(targetId);
	const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, targetAdapterId);
	const project = createAdapterRouteProject(CodemodAdapterId.ChakraUi, targetAdapterId, "#2a57c8");
	return route.runAsync({
		source,
		file,
		project,
		semantic: semanticFor(CodemodAdapterId.ChakraUi),
	});
};

describe("adapter edge and non-happy matrix", () => {
	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"preserves or reports an edge case for %s in every target direction",
		async (sourceId) => {
			const fixture = fixtures.get(sourceId);
			if (fixture === undefined) throw new Error(`missing fixture for ${sourceId}`);
			const edge = edgeSource(sourceId, fixture.source);
			for (const target of catalog.adapters) {
				const result =
					sourceId === CodemodAdapterId.ChakraUi
						? await migrateChakra(edge.source, target.id, fixture.file)
						: migrate(edge.source, sourceId, target.id, fixture.file);
				const explicitEvidence = result.residuals.length > 0 || result.skipped > 0;
				const unchanged = result.code === edge.source;
				const converted = result.converted > 0;
				expect(
					unchanged || converted || explicitEvidence,
					`${sourceId} -> ${target.id} silently discarded an edge case`,
				).toBe(true);
				if (result.skipped > 0) expect(result.residuals.length).toBeGreaterThan(0);
				if (result.code.includes("pandwind:migrate-skip")) {
					expect(result.code).toMatch(
						/(capability-blocked|parse-residual|lowering-residual|host-rewrite-required|configuration-residual)/,
					);
					expect(result.code).not.toContain("adapter capability mismatch");
				}
				if (edge.expression !== undefined && converted && result.residuals.length === 0)
					expect(result.code).toContain(edge.expression);
			}
		},
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps malformed %s source recoverable",
		async (sourceId) => {
			const fixture = fixtures.get(sourceId);
			if (fixture === undefined) throw new Error(`missing fixture for ${sourceId}`);
			const malformed = `${fixture.source}\n/* unfinished ${sourceId}`;
			for (const target of catalog.adapters) {
				const result =
					sourceId === CodemodAdapterId.ChakraUi
						? await migrateChakra(malformed, target.id, fixture.file)
						: migrate(malformed, sourceId, target.id, fixture.file);
				expect(result.code.length).toBeGreaterThan(0);
				expect(
					result.code.includes(`unfinished ${sourceId}`) ||
						result.residuals.length > 0 ||
						result.skipped > 0,
					`${sourceId} -> ${target.id} lost malformed source`,
				).toBe(true);
			}
		},
	);

	test("keeps the flat SwapIR route independently available", () => {
		const result = migrate(
			'import { css } from "pandwind/css";\nconst card = css.class({ color: "red" });',
			pandwind,
			CodemodAdapterId.Emotion,
			"Card.tsx",
		);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css({");
	});
});
