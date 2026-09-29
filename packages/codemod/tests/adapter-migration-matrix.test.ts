import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { resolve } from "node:path";
import { loadMetaFromSources } from "../src/meta.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	runSwap,
} from "../src/swap/index.ts";
import type { AdapterParseContext } from "../src/swap/adapter-contract.ts";
import { StyleHostRepresentationKind } from "../src/swap/identifiers.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	requireBuiltinAdapterId,
} from "./route-spec-support.ts";

const catalog = createBuiltinCodemodCatalog();
const pandwind = CodemodAdapterId.Pandwind;
const globalStylesheetSources = new Set<string>([
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.Sass,
	CodemodAdapterId.Less,
]);
const stylesheetTargets = new Set<string>([
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.CssModules,
	CodemodAdapterId.Sass,
	CodemodAdapterId.Less,
]);

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
matrixFixtures.set(CodemodAdapterId.Tailwind, {
	adapter: CodemodAdapterId.Tailwind,
	file: "App.tsx",
	source: '<div className="[display:flex] [padding:1rem]" />',
});
matrixFixtures.set(CodemodAdapterId.UnoCSS, {
	adapter: CodemodAdapterId.UnoCSS,
	file: "App.tsx",
	source: '<div className="[display:flex] [align-items:center]" />',
});
for (const adapter of [
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.CssModules,
	CodemodAdapterId.Sass,
	CodemodAdapterId.Less,
]) {
	const fixture = matrixFixtures.get(adapter)!;
	matrixFixtures.set(adapter, {
		...fixture,
		source: ".card { color: red; padding: 1rem; }",
	});
}

function fixtureFor(adapter: string) {
	const fixture = matrixFixtures.get(adapter);
	if (fixture === undefined) throw new Error(`missing matrix fixture for ${adapter}`);
	return fixture;
}

function sourceSemantic(adapter: string): AdapterParseContext["semantic"] | undefined {
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
		...(from === CodemodAdapterId.CssModules ? { root: "/project", listFiles: () => [] } : {}),
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		mode: "safe",
	});
}

const migrateToAsync = (
	source: string,
	from: string,
	to: string,
	file: string,
	semantic?: ReturnType<typeof sourceSemantic>,
) => {
	fixtureFor(from);
	fixtureFor(to);
	const sourceAdapterId = requireBuiltinAdapterId(from);
	const targetAdapterId = requireBuiltinAdapterId(to);
	const project = createAdapterRouteProject(sourceAdapterId, targetAdapterId, "#2a57c8");
	const route = createAdapterRouteSpec(sourceAdapterId, targetAdapterId);
	return route.runAsync({
		source,
		file,
		project,
		...(semantic === undefined ? {} : { semantic }),
	});
};

describe("bidirectional registered adapter matrix", () => {
	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"lowers %s to Pandwind with a valid semantic result",
		async (adapterId) => {
			const fixture = fixtureFor(adapterId);
			const result =
				adapterId === CodemodAdapterId.ChakraUi
					? await migrateToAsync(
							fixture.source,
							adapterId,
							pandwind,
							fixture.file,
							sourceSemantic(adapterId),
						)
					: migrateTo(fixture.source, adapterId, pandwind, fixture.file, sourceSemantic(adapterId));
			if (adapterId === pandwind) {
				expect(result.code).toBe(fixture.source);
				expect(result.changed).toBe(false);
				expect(result.skipped).toBe(0);
				return;
			}
			if (globalStylesheetSources.has(adapterId)) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBeGreaterThan(0);
				expect(result.residuals).toEqual(
					expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
				);
				expect(result.code).toContain("pandwind:migrate-skip");
				expect(result.code.endsWith(fixture.source)).toBe(true);
				return;
			}
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
			const targetFile =
				targetId === CodemodAdapterId.Treat
					? "Card.treat.ts"
					: targetId === CodemodAdapterId.VanillaExtract
						? "Card.css.ts"
						: "Card.tsx";
			const result = migrateTo(
				'import { css } from "pandwind/css";\n' +
					'const card = css.class({ color: "red", padding: "1rem" });',
				pandwind,
				targetId,
				targetFile,
			);
			if (targetId === pandwind) {
				expect(result.changed).toBe(false);
				expect(result.skipped).toBe(0);
				return;
			}
			if (targetId === CodemodAdapterId.Mui) {
				expect(result.converted, `${targetId} was not converted`).toBeGreaterThan(0);
				expect(result.skipped, `${targetId} was skipped`).toBe(0);
				expect(result.residuals).toEqual([]);
				expect(result.outcomes).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							outcome: "portable-artifact",
							representation: "portable-artifact",
						}),
					]),
				);
				return;
			}
			if (targetId === CodemodAdapterId.Mantine) {
				expect(result.converted + result.skipped).toBeGreaterThan(0);
				expect(result.skipped).toBeGreaterThan(0);
				expect(result.residuals.length).toBeGreaterThan(0);
				expect(result.code).toContain("pandwind:migrate-skip");
				return;
			}
			if (stylesheetTargets.has(targetId)) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBeGreaterThan(0);
				expect(result.residuals).toEqual(
					expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
				);
				expect(result.code).toContain("pandwind:migrate-skip");
				expect(result.code).toContain("css.class");
				return;
			}
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
			if (targetId === pandwind) {
				expect(result.code).toContain("theme.foreground");
				expect(result.changed).toBe(false);
				expect(result.residuals).toEqual([]);
				return;
			}
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

	test("executes every registered source-to-target route with explicit outcome evidence", async () => {
		const outcomes: string[] = [];
		for (const sourceAdapter of catalog.adapters) {
			const fixture = fixtureFor(sourceAdapter.id);
			for (const targetAdapter of catalog.adapters) {
				const result =
					sourceAdapter.id === CodemodAdapterId.ChakraUi
						? await migrateToAsync(
								fixture.source,
								sourceAdapter.id,
								targetAdapter.id,
								fixture.file,
								sourceSemantic(sourceAdapter.id),
							)
						: migrateTo(
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
				if (sourceAdapter.id === targetAdapter.id) {
					expect(result.code).toBe(fixture.source);
					expect(result.changed).toBe(false);
					expect(result.skipped).toBe(0);
					expect(result.residuals).toEqual([]);
					outcomes.push(`${sourceAdapter.id}->${targetAdapter.id}`);
					continue;
				}
				expect(
					result.loweringPlans.length,
					`${sourceAdapter.id} -> ${targetAdapter.id} did not expose a lowering decision`,
				).toBeGreaterThan(0);
				expect(
					converted || residualEvidence > 0,
					`${sourceAdapter.id} -> ${targetAdapter.id} produced no conversion or residual evidence`,
				).toBe(true);
				if (converted && result.residuals.length === 0) {
					expect(
						result.validations,
						`${sourceAdapter.id} -> ${targetAdapter.id} has no target validation evidence`,
					).toHaveLength(result.converted);
					expect(
						result.validations.every(
							(validation) =>
								validation.valid && validation.canonicalSource === validation.canonicalTarget,
						),
						`${sourceAdapter.id} -> ${targetAdapter.id} changed the canonical style semantics`,
					).toBe(true);
					expect(
						result.validations.every((validation) => validation.valid),
						`${sourceAdapter.id} -> ${targetAdapter.id} emitted an invalid semantic result`,
					).toBe(true);
				}
				if (result.skipped > 0)
					expect(
						result.residuals.length,
						`${sourceAdapter.id} -> ${targetAdapter.id} skipped without residuals`,
					).toBeGreaterThan(0);
				if (result.code.includes("pandwind:migrate-skip")) {
					expect(result.code).toMatch(
						/(capability-blocked|parse-residual|lowering-residual|host-rewrite-required|configuration-residual)/,
					);
					expect(result.code).not.toContain("adapter capability mismatch");
				}
				outcomes.push(`${sourceAdapter.id}->${targetAdapter.id}`);
			}
		}
		expect(outcomes).toHaveLength(catalog.adapters.length ** 2);
	}, 30_000);

	test("preserves malformed source tails for every ordered route", () => {
		for (const sourceAdapter of catalog.adapters) {
			const fixture = fixtureFor(sourceAdapter.id);
			const malformed = `${fixture.source}\nconst unfinished = { /* unfinished ${sourceAdapter.id} */`;
			for (const targetAdapter of catalog.adapters) {
				const result = migrateTo(
					malformed,
					sourceAdapter.id,
					targetAdapter.id,
					fixture.file,
					sourceSemantic(sourceAdapter.id),
				);
				expect(
					result.code.includes(`/* unfinished ${sourceAdapter.id} */`) ||
						result.residuals.some((residual) => residual.text.includes(sourceAdapter.id)) ||
						result.skipped > 0,
					`${sourceAdapter.id} -> ${targetAdapter.id} discarded malformed source`,
				).toBe(true);
			}
		}
	}, 60_000);
});

describe("composed cross-ecosystem routes", () => {
	test.each([
		CodemodAdapterId.ChakraUi,
		CodemodAdapterId.Mantine,
		CodemodAdapterId.Stitches,
		CodemodAdapterId.StyledComponents,
		CodemodAdapterId.Style9,
		CodemodAdapterId.SolidStyled,
		CodemodAdapterId.VueStyled,
	])("preserves named style maps when targeting %s", (targetId) => {
		const source =
			'import { StyleSheet } from "aphrodite";\n' +
			'const styles = StyleSheet.create({ button: { color: "red" } });';
		const result = migrateTo(source, CodemodAdapterId.Aphrodite, targetId, "styles.ts");

		if (targetId === CodemodAdapterId.VueStyled) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBe(1);
			expect(
				result.residuals.some((residual) =>
					residual.hint?.includes("named-rules: named style rule: button"),
				),
			).toBe(true);
			expect(result.code).toContain("pandwind:migrate-skip");
			expect(result.code).toContain(
				'const styles = StyleSheet.create({ button: { color: "red" } });',
			);
			expect(result.code).toMatchInlineSnapshot(`
				"import { StyleSheet } from "aphrodite";
				// pandwind:migrate-skip (route: aphrodite -> vue-styled | capability-blocked: named-rules: named style rule: button | available: static, residual)
				const styles = StyleSheet.create({ button: { color: "red" } });"
			`);
			return;
		}
		if (targetId === CodemodAdapterId.Mantine) {
			expect(result.converted + result.skipped).toBeGreaterThan(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals.length).toBeGreaterThan(0);
			expect(result.code).toContain("pandwind:migrate-skip");
			return;
		}
		expect(result.residuals, `${CodemodAdapterId.Aphrodite} -> ${targetId}`).toEqual([]);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain("button");
	});

	const classTargets = catalog.adapters
		.filter(
			(adapter) =>
				adapter.migration?.targetPolicy?.handlesHostRewrites === true &&
				adapter.migration.targetPolicy.hostRepresentation === StyleHostRepresentationKind.Class,
		)
		.map((adapter) => adapter.id);
	const inlineClassTargets: ReadonlySet<string> = new Set([
		CodemodAdapterId.Pandwind,
		CodemodAdapterId.Emotion,
	]);

	test.each(classTargets)("rewrites a styled subject to a static class in %s", (targetId) => {
		const result = migrateTo(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			CodemodAdapterId.StyledComponents,
			targetId,
			"Card.tsx",
			{ source: { framework: "react" } },
		);

		if (targetId === CodemodAdapterId.Treat || targetId === CodemodAdapterId.VanillaExtract) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain("styled.div");
			expect(result.code).toContain("<Card />");
			return;
		}

		expect(
			result.residuals,
			`${CodemodAdapterId.StyledComponents} -> ${targetId}: ${result.code}`,
		).toEqual([]);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain("Card =");
		if (inlineClassTargets.has(targetId)) {
			expect(result.code).toContain("export const App = () => <div className={Card} />;");
			return;
		}
		expect(result.code).toContain("export const App = () => <Card />;");
		expect(result.code).toContain("__pandwindCardForwardRef");
		if (targetId === CodemodAdapterId.CssModules) {
			expect(result.code).toContain(".module.css");
		} else {
			expect(result.code).toContain('props.as ?? props.forwardedAs ?? "div"');
		}
	});

	test("rewrites a styled subject into a static class target", () => {
		const result = migrateTo(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.VanillaExtract,
			"Card.tsx",
			{ source: { framework: "react" } },
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result.code).toContain("styled.div");
		expect(result.code).toContain("<Card />");
	});

	test("wraps Solid styled components when targeting a class adapter", () => {
		const source =
			'import { styled } from "solid-styled-components";\n' +
			'const Card = styled.div({ color: "red" });\n' +
			"export const App = () => <Card />;";
		const result = migrateTo(
			source,
			CodemodAdapterId.SolidStyled,
			CodemodAdapterId.Tailwind,
			"App.tsx",
			sourceSemantic(CodemodAdapterId.SolidStyled),
		);

		expect({
			code: result.code,
			converted: result.converted,
			skipped: result.skipped,
			residuals: result.residuals,
		}).toMatchInlineSnapshot(`
			{
			  "code": "import { children as __pandwindCardChildren, splitProps as __pandwindCardSplitProps } from "solid-js";
			import type { JSX as __pandwindCardJSX } from "solid-js";
			const Card = (() => { type __pandwindCardProps = __pandwindCardJSX.IntrinsicElements["div"]; return (props: __pandwindCardProps) => { const [local, forwarded] = __pandwindCardSplitProps(props, ["class", "children", "ref"]); const resolvedChildren = __pandwindCardChildren(() => local.children); return <div {...forwarded} ref={local.ref} class={["[color:red]", local.class].filter(Boolean).join(" ")}>{resolvedChildren()}</div>; }; })();
			export const App = () => <Card />;",
			  "converted": 1,
			  "residuals": [],
			  "skipped": 0,
			}
		`);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('from "solid-js";');
		expect(result.code).toContain('class={["[color:red]", local.class].filter(Boolean).join(" ")}');
		expect(result.code).toContain("{resolvedChildren()}</div>");
		expect(result.code).toContain("export const App = () => <Card />;");
	});

	test("folds a resolved theme interpolation before class-target emission", () => {
		const result = migrateTo(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.colors.foreground });\n" +
				"export const App = () => <Card />;",
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.VanillaExtract,
			"Card.tsx",
			{
				source: { framework: "react" },
				themes: [
					{
						path: "colors.foreground",
						authored: "theme.colors.foreground",
						resolved: "red",
					},
				],
			},
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result.code).toContain("theme.colors.foreground");
	});

	const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
	const meta = loadMetaFromSources({
		typesDtsPath: resolve(appDir, "types.d.ts"),
		twTsPath: resolve(appDir, "tw.ts"),
		bridgePath: resolve(appDir, "bridge.ts"),
		tokens: examplePreset.tokens,
	});

	test("Chakra UI -> Pandwind -> Tailwind completes without residuals", async () => {
		const chakra = await migrateToAsync(
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
			metaDir: "examples/example/src",
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
				metaDir: "examples/example/src",
			},
		);
		const chakra = migrateTo(pandwindSource.code, pandwind, CodemodAdapterId.ChakraUi, "Card.tsx");
		expect(pandwindSource.converted).toBe(1);
		expect(chakra.residuals).toEqual([]);
		expect(chakra.converted).toBe(1);
		expect(chakra.validations.every((validation) => validation.valid)).toBe(true);
		expect(chakra.code).toContain("const card =");
		expect(chakra.code).toContain('backgroundColor: "#3182ce"');
	});

	test("Chakra UI -> Tailwind preserves the JSX host while lowering style props", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Tailwind);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Tailwind,
			"#2a57c8",
		);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\n' +
				'export const Card = () => <Box color="red" padding="1rem" />;',
			file: "Card.tsx",
			semantic: sourceSemantic(CodemodAdapterId.ChakraUi),
			project,
		});

		expect(result.residuals).toEqual([]);
		expect(result.skipped).toBe(0);
		expect(result.code).toMatch(/<Box\s+className=\{/u);
		expect(result.code).toContain("[color:red]");
		expect(result.code).not.toContain('color="red"');
		expect(result.code).not.toMatch(/=>\s*"\[/u);
	});

	test("Tailwind -> Chakra preserves the JSX host while lowering class utilities", () => {
		const result = migrateTo(
			'<div className="[color:red] [padding:1rem]" />',
			CodemodAdapterId.Tailwind,
			CodemodAdapterId.ChakraUi,
			"Card.tsx",
		);

		expect(result.residuals).toEqual([]);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain("<chakra.div");
		expect(result.code).toContain('css={{ color: "red", padding: "1rem" }}');
		expect(result.code).not.toMatch(/^\s*css\(\{/u);
	});
});
