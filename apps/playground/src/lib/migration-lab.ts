import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	findMigrationRouteProof,
	PANDWIND_API_DIALECTS,
	runAdapterMigration,
	type AdapterCapabilityReport,
	type AdapterDependencies,
	type AdapterMigrationOutcome,
	type AdapterValidationResult,
	type StyleAdapter,
	type TailwindUtilityResolver,
} from "pandwind-codemod/swap/browser";
import { officialApiCases, officialApiFamilyCases } from "pandwind-codemod/swap/official-api-cases";
import { PLAYGROUND_MIGRATION_META } from "./migration-meta.ts";
import { createPlaygroundTailwindResolver } from "./tailwind-default-resolver.ts";

export const MIGRATION_LAB_EXECUTION_LANE = {
	Sandbox: "sandbox",
} as const;

export const MIGRATION_LAB_EXECUTION_SCOPE = {
	BrowserAdapterProgram: "browser-adapter-program",
} as const;

export interface MigrationLabExecutionEvidence {
	readonly lane: (typeof MIGRATION_LAB_EXECUTION_LANE)[keyof typeof MIGRATION_LAB_EXECUTION_LANE];
	readonly scope: (typeof MIGRATION_LAB_EXECUTION_SCOPE)[keyof typeof MIGRATION_LAB_EXECUTION_SCOPE];
	readonly verified: readonly string[];
	readonly unavailable: readonly string[];
	readonly note: string;
}

export interface MigrationLabEndpoint {
	readonly id: string;
	readonly label: string;
	readonly role: "source" | "target";
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
}

export interface MigrationLabResult {
	readonly ok: true;
	readonly execution: MigrationLabExecutionEvidence;
	readonly routeProof: ReturnType<typeof findMigrationRouteProof>;
	readonly code: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: readonly {
		readonly kind: string;
		readonly text: string;
		readonly hint?: string;
	}[];
	readonly reports: readonly AdapterCapabilityReport[];
	readonly validations: readonly AdapterValidationResult[];
	readonly dependencies: readonly AdapterDependencies[];
	readonly outcomes: readonly AdapterMigrationOutcome[];
}

export const MIGRATION_LAB_EVIDENCE_CHECK = {
	AdapterProgram: "adapter-program",
	ResidualReport: "residual-report",
	ProjectTypecheck: "project-typecheck",
	ProjectBuild: "project-build",
	BrowserHost: "browser-host",
	SsrHydration: "ssr-hydration",
} as const;

interface MigrationLabError {
	readonly ok: false;
	readonly message: string;
}

export interface MigrationLabScenario {
	readonly key: string;
	readonly name: string;
	readonly file?: string;
	readonly source: string;
	readonly expectation?: "converted" | "runtime" | "residual" | "identity" | "context";
}

export interface MigrationLab {
	readonly ready: Promise<void>;
	readonly sources: readonly MigrationLabEndpoint[];
	readonly targets: readonly MigrationLabEndpoint[];
	readonly sampleFor: (id: string) => string;
	readonly scenariosFor: (id: string) => readonly MigrationLabScenario[];
	readonly migrate: (
		from: string,
		to: string,
		source: string,
	) => MigrationLabResult | MigrationLabError;
}

export interface MigrationLabOptions {
	readonly tailwindResolver?: TailwindUtilityResolver;
	readonly ready?: Promise<void>;
}

const SAMPLE_SOURCES: Readonly<Partial<Record<CodemodAdapterId, string>>> = {
	[CodemodAdapterId.Panda]: `import { css } from "@pandacss/dev";

const card = css({
	color: "red.500",
	padding: "4",
});`,
	[CodemodAdapterId.Pandwind]: `import { createCss } from "pandwind/css";

const css = createCss();
const card = css.class({ color: "red", padding: "1rem" });`,
	[CodemodAdapterId.StyledComponents]: `import styled from "styled-components";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;

export function App() {
	return <Card />;
}`,
	[CodemodAdapterId.Emotion]: `import { css } from "@emotion/css";

const card = css({
	color: "red",
	padding: 16,
});`,
	[CodemodAdapterId.StyleX]: `import * as stylex from "stylex";

const styles = stylex.create({
	card: {
		color: "red",
		padding: 16,
	},
});`,
	[CodemodAdapterId.Linaria]: `import { css } from "@linaria/core";

const card = css\`
	color: red;
	padding: 1rem;
\`;`,
	[CodemodAdapterId.Stitches]: `import { css } from "@stitches/react";

const card = css({
	color: "red",
	padding: "1rem",
});`,
	[CodemodAdapterId.VanillaExtract]: `import { style } from "@vanilla-extract/css";

export const card = style({
	color: "red",
	padding: 16,
});`,
	[CodemodAdapterId.Jss]: `import { createUseStyles } from "react-jss";

const useStyles = createUseStyles({
	card: {
		color: "red",
		padding: 16,
	},
});`,
	[CodemodAdapterId.Fela]: `import { RendererProvider } from "react-fela";

const card = renderer.renderRule(() => ({
	color: "red",
	padding: "1rem",
}));`,
	[CodemodAdapterId.Goober]: `import { css } from "goober";

const card = css({
	color: "red",
	padding: "1rem",
});`,
	[CodemodAdapterId.Aphrodite]: `import { StyleSheet } from "aphrodite";

const styles = StyleSheet.create({
	card: {
		color: "red",
		padding: 16,
	},
});`,
	[CodemodAdapterId.Treat]: `import { style } from "@treat/webpack";

export const card = style({
	color: "red",
	padding: "1rem",
});`,
	[CodemodAdapterId.Compiled]: `import { css } from "@compiled/react";

const card = css({
	color: "red",
	padding: 16,
});`,
	[CodemodAdapterId.ChakraUi]: `import { Box } from "@chakra-ui/react";

export function Card() {
	return <Box color="red.500" p="4" />;
}`,
	[CodemodAdapterId.Mui]: `import { Box } from "@mui/material";

export function Card() {
	return <Box sx={{ color: "red", p: 2 }} />;
}`,
	[CodemodAdapterId.Mantine]: `import { Box } from "@mantine/core";

export function Card() {
	return <Box c="red" p="md" />;
}`,
	[CodemodAdapterId.NextYak]: `import { styled } from "next-yak";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;`,
	[CodemodAdapterId.SolidStyled]: `import { styled } from "solid-styled-components";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;`,
	[CodemodAdapterId.VueStyled]: `<script setup>
import styled from "vue-styled-components";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;
</script>

<template>
	<Card />
</template>`,
	[CodemodAdapterId.Tokenami]: `import { css } from "@tokenami/css";

const card = css({
	"--color": "red",
	"--padding": "1rem",
});`,
	[CodemodAdapterId.UnoCSS]: `<div class="[color:#ef4444] [padding:1rem]" />`,
	[CodemodAdapterId.Tailwind]: `import "tailwindcss";

<div className="text-white bg-black p-4" />`,
	[CodemodAdapterId.ReactNative]: `import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
	card: {
		color: "red",
		padding: 16,
	},
});`,
	[CodemodAdapterId.Bamboo]: `import { css } from "styled-system/css";

const card = css({ color: "red", padding: "1rem" });`,
	[CodemodAdapterId.Style9]: `import style9 from "style9";

const styles = style9.create({
	card: { color: "red", padding: 16 },
});`,
	[CodemodAdapterId.Tamagui]: `import { styled, View } from "tamagui";

export const Card = styled(View, { color: "red", padding: 16 });`,
	[CodemodAdapterId.AuthoredCss]: `/* Card banner */
.card {
	color: red;
	padding: 1rem;
}
`,
	[CodemodAdapterId.CssModules]: `/* Card banner */
.card {
	color: red;
	padding: 1rem;
}
`,
	// Brace syntax only: the browser lab has no official Sass compiler, so
	// indented-syntax sources fail closed there by design (see the codemod
	// corpus proof for the compiler-backed indented path).
	[CodemodAdapterId.Sass]: `/* Card banner */
.card {
	color: red;
	padding: 1rem;
}
`,
	[CodemodAdapterId.Less]: `/* Card banner */
.card {
	color: red;
	padding: 1rem;
}
`,
};

/**
 * Sample filenames are proven against each adapter's own detection contract
 * instead of a per-adapter id branch: stylesheet sources must land on a
 * stylesheet extension or the adapter can never match them.
 */
const SAMPLE_FILE_CANDIDATES = [
	"Example.tsx",
	"Example.vue",
	"styles.css",
	"Card.module.css",
	"styles.scss",
	"styles.sass",
	"styles.less",
] as const;

function labelFor(adapter: StyleAdapter): string {
	return adapter.id
		.split(/[-:]/u)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function endpointFor(adapter: StyleAdapter, role: "source" | "target"): MigrationLabEndpoint {
	return {
		id: adapter.id,
		label: labelFor(adapter),
		role,
		dependencies: adapter.dependencies.packages.map((dependency) => dependency.name),
		capabilities: Object.entries(adapter.capabilities.capabilities)
			.filter(([, support]) => support !== "unsupported")
			.map(([name]) => name),
	};
}

function pandwindApiEndpoint(
	registry: ReturnType<typeof createBuiltinCodemodCatalog>["registry"],
	api: (typeof PANDWIND_API_DIALECTS)[number],
): MigrationLabEndpoint {
	const route = `${CodemodAdapterId.Pandwind}/${api.dialect}`;
	const adapter = registry.getDialect(route);
	if (adapter === undefined) throw new Error(`missing Pandwind API target: ${route}`);
	return { ...endpointFor(adapter, "target"), id: route, label: api.label };
}

function fileFor(
	registry: { get(id: string): StyleAdapter | undefined },
	from: string,
	source: string,
): string {
	const adapter = registry.get(from);
	if (adapter === undefined) return "Example.tsx";
	return (
		SAMPLE_FILE_CANDIDATES.find((file) => adapter.detect({ file, source }).matched) ?? "Example.tsx"
	);
}

/** Browser composition root for the same registry-backed migration use case as the CLI. */
export function createMigrationLab(options: MigrationLabOptions = {}): MigrationLab {
	const catalog = createBuiltinCodemodCatalog(
		options.tailwindResolver === undefined
			? undefined
			: { tailwindResolver: options.tailwindResolver },
	);
	const endpoints = catalog.adapters
		.toSorted((left, right) => labelFor(left).localeCompare(labelFor(right)))
		.map((adapter) => ({
			source: endpointFor(adapter, "source"),
			target: endpointFor(adapter, "target"),
			adapter,
		}));
	const pandwindTargets = PANDWIND_API_DIALECTS.map((api) =>
		pandwindApiEndpoint(catalog.registry, api),
	);
	return {
		ready: options.ready ?? Promise.resolve(),
		sources: endpoints.map(({ source }) => source),
		targets: [...endpoints.map(({ target }) => target), ...pandwindTargets],
		sampleFor: (id) =>
			SAMPLE_SOURCES[id as CodemodAdapterId] ??
			`// No built-in sample yet for ${id}. Paste a source file to try this adapter.`,
		scenariosFor: (id) => {
			const primary = officialApiCases()
				.filter((api) => api.adapter === id)
				.map((api, index) => ({
					key: "primary-" + index,
					name: api.name,
					file: api.file,
					source: api.source,
				}));
			const families = officialApiFamilyCases()
				.filter((api) => api.adapter === id)
				.map((api, index) => ({
					key: "family-" + index,
					name: api.name,
					file: api.file,
					source: api.source,
					expectation: api.expectation,
				}));
			return [...primary, ...families];
		},
		migrate: (from, to, source) => {
			try {
				const result = runAdapterMigration(source, {
					from,
					to,
					file: fileFor(catalog.registry, from, source),
					readFile: () => undefined,
					registry: catalog.registry,
					adapterRegistry: catalog.registry,
					meta: PLAYGROUND_MIGRATION_META,
					mode: "safe",
				});
				return {
					ok: true,
					execution: {
						lane: MIGRATION_LAB_EXECUTION_LANE.Sandbox,
						scope: MIGRATION_LAB_EXECUTION_SCOPE.BrowserAdapterProgram,
						verified: [
							MIGRATION_LAB_EVIDENCE_CHECK.AdapterProgram,
							MIGRATION_LAB_EVIDENCE_CHECK.ResidualReport,
						],
						unavailable: [
							MIGRATION_LAB_EVIDENCE_CHECK.ProjectTypecheck,
							MIGRATION_LAB_EVIDENCE_CHECK.ProjectBuild,
							MIGRATION_LAB_EVIDENCE_CHECK.BrowserHost,
							MIGRATION_LAB_EVIDENCE_CHECK.SsrHydration,
						],
						note: "This browser lab runs the adapter program; it does not build or run a host project.",
					},
					routeProof: findMigrationRouteProof(from, to, catalog.registry),
					...result,
				};
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}

const playgroundTailwindResolver = createPlaygroundTailwindResolver();

export const MIGRATION_LAB = createMigrationLab({
	tailwindResolver: playgroundTailwindResolver,
	ready: playgroundTailwindResolver.ready,
});
