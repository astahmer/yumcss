import { describe, expect, test } from "vitest";
import { examplePreset } from "pandwind/preset";
import { resolve } from "node:path";
import { loadMetaFromSources } from "../src/meta.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	runSwap,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "./adapter-contract-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();
const pandwind = CodemodAdapterId.Pandwind;

/**
 * Component subjects need a host use in order to prove that the migration
 * rewrites both the declaration and its framework syntax. The contract
 * fixtures intentionally stay minimal; this matrix owns the richer proof
 * shape without making the registry depend on test-only source documents.
 */
const matrixFixtures = new Map(
	adapterContractFixtures.map((fixture) => [fixture.adapter, fixture]),
);
matrixFixtures.set(CodemodAdapterId.StyledComponents, {
	adapter: CodemodAdapterId.StyledComponents,
	file: "App.tsx",
	source:
		'import styled from "styled-components";\n' +
		'const Card = styled.div({ color: "red" });\n' +
		"export const App = () => <Card />;",
});
matrixFixtures.set(CodemodAdapterId.SolidStyled, {
	adapter: CodemodAdapterId.SolidStyled,
	file: "App.tsx",
	source:
		'import { styled } from "solid-styled-components";\n' +
		'const Card = styled.div({ color: "red" });\n' +
		"export const App = () => <Card />;",
});
matrixFixtures.set(CodemodAdapterId.VueStyled, {
	adapter: CodemodAdapterId.VueStyled,
	file: "App.vue",
	source:
		"<script setup>\n" +
		'import styled from "vue-styled-components";\n' +
		'const Card = styled.div({ color: "red" });\n' +
		"</script>\n<template><Card /></template>",
});

function fixtureFor(adapter: string) {
	const fixture = matrixFixtures.get(adapter);
	if (fixture === undefined) throw new Error(`missing matrix fixture for ${adapter}`);
	return fixture;
}

function sourceSemantic(
	adapter: string,
): { readonly source: { readonly framework: "react" | "solid" | "vue" } } | undefined {
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

function migrateTo(
	source: string,
	from: string,
	to: string,
	file: string,
	semantic?: ReturnType<typeof sourceSemantic>,
) {
	return runAdapterMigration(source, {
		from,
		to,
		file,
		...(semantic === undefined ? {} : { semantic }),
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		mode: "safe",
	});
}

describe("bidirectional registered adapter matrix", () => {
	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"lowers %s to Pandwind with a valid semantic result",
		(adapterId) => {
			const fixture = fixtureFor(adapterId);
			const result = migrateTo(
				fixture.source,
				adapterId,
				pandwind,
				fixture.file,
				sourceSemantic(adapterId),
			);
			expect(
				result.residuals,
				`${adapterId} -> ${pandwind}: ${JSON.stringify(result.residuals)}`,
			).toEqual([]);
			expect(result.converted, `${adapterId} was not converted`).toBeGreaterThan(0);
			expect(result.skipped, `${adapterId} was skipped`).toBe(0);
			expect(result.validations.every((validation) => validation.valid)).toBe(true);
		},
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"emits a valid Pandwind source to %s",
		(targetId) => {
			const result = migrateTo(
				'import { css } from "pandwind/css";\n' +
					'const card = css.class({ color: "red", padding: "1rem" });',
				pandwind,
				targetId,
				"Card.tsx",
			);
			expect(
				result.residuals,
				`${pandwind} -> ${targetId}: ${JSON.stringify(result.residuals)}`,
			).toEqual([]);
			expect(result.converted, `${targetId} was not converted`).toBeGreaterThan(0);
			expect(result.skipped, `${targetId} was skipped`).toBe(0);
			expect(result.validations.every((validation) => validation.valid)).toBe(true);
		},
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"does not silently drop a dynamic value when targeting %s",
		(targetId) => {
			const result = migrateTo(
				'import { css } from "pandwind/css";\n' +
					"const card = css.class({ color: theme.foreground });",
				pandwind,
				targetId,
				"DynamicCard.tsx",
			);
			const evidence = result.residuals.length + result.skipped;
			if (evidence > 0) {
				expect(result.residuals.length).toBeGreaterThan(0);
				return;
			}
			// Runtime-capable targets may convert this expression. In that case
			// the source expression must survive in the emitted carrier; a clean
			// result with the value absent would be silent semantic loss.
			expect(result.converted).toBeGreaterThan(0);
			expect(result.code).toContain("theme.foreground");
		},
	);

	test("executes every registered source-to-target route with explicit outcome evidence", () => {
		const outcomes: string[] = [];
		for (const sourceAdapter of catalog.adapters) {
			const fixture = fixtureFor(sourceAdapter.id);
			for (const targetAdapter of catalog.adapters) {
				const result = migrateTo(
					fixture.source,
					sourceAdapter.id,
					targetAdapter.id,
					fixture.file,
					sourceSemantic(sourceAdapter.id),
				);
				const residualEvidence =
					result.residuals.length +
					result.skipped +
					result.validations.flatMap((validation) => validation.residuals).length;
				const converted = result.converted > 0;
				expect(
					converted || residualEvidence > 0,
					`${sourceAdapter.id} -> ${targetAdapter.id} produced no conversion or residual evidence`,
				).toBe(true);
				if (result.skipped > 0)
					expect(
						result.residuals.length,
						`${sourceAdapter.id} -> ${targetAdapter.id} skipped without residuals`,
					).toBeGreaterThan(0);
				outcomes.push(`${sourceAdapter.id}->${targetAdapter.id}`);
			}
		}
		expect(outcomes).toHaveLength(catalog.adapters.length ** 2);
	});
});

describe("composed cross-ecosystem routes", () => {
	const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
	const meta = loadMetaFromSources({
		typesDtsPath: resolve(appDir, "types.d.ts"),
		twTsPath: resolve(appDir, "tw.ts"),
		bridgePath: resolve(appDir, "bridge.ts"),
		tokens: examplePreset.tokens,
	});

	test("Chakra UI -> Pandwind -> Tailwind completes without residuals", () => {
		const chakra = migrateTo(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const Card = () => <Box color="red" padding="1rem" />;',
			CodemodAdapterId.ChakraUi,
			pandwind,
			"Card.tsx",
			sourceSemantic(CodemodAdapterId.ChakraUi),
		);
		const tailwind = runSwap(chakra.code, meta, {
			from: "css",
			to: "tailwind",
			file: "Card.tsx",
			metaDir: "apps/example/src",
			capabilityMode: "partial",
		});
		expect(chakra.residuals).toEqual([]);
		expect(tailwind.skippedByMarker).toBe(0);
		expect(tailwind.converted).toBeGreaterThan(0);
		expect(tailwind.code).toContain("[color:red]");
	});

	test("Tailwind dialect -> Pandwind -> Chakra UI completes without residuals", () => {
		const pandwindSource = runSwap(
			'import { css } from "./design.ts";\n' +
				'const card = tw({ bgColor: "blue-500", textSize: "lg" });',
			meta,
			{
				from: "tw",
				to: "css.class",
				file: "Card.tsx",
				metaDir: "apps/example/src",
			},
		);
		const chakra = migrateTo(pandwindSource.code, pandwind, CodemodAdapterId.ChakraUi, "Card.tsx");
		expect(pandwindSource.converted).toBe(1);
		expect(chakra.residuals).toEqual([]);
		expect(chakra.converted).toBe(1);
		expect(chakra.validations.every((validation) => validation.valid)).toBe(true);
		expect(chakra.code).toContain("@chakra-ui/react");
		expect(chakra.code).toContain('backgroundColor: "#3182ce"');
	});
});
