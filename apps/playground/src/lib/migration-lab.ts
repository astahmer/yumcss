import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	type AdapterCapabilityReport,
	type AdapterDependencies,
	type AdapterValidationResult,
	type StyleAdapter,
} from "pandwind-codemod/swap/browser";

export interface MigrationLabEndpoint {
	readonly id: string;
	readonly label: string;
	readonly role: "source" | "target";
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
}

export interface MigrationLabResult {
	readonly ok: true;
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
}

export interface MigrationLabError {
	readonly ok: false;
	readonly message: string;
}

export interface MigrationLab {
	readonly sources: readonly MigrationLabEndpoint[];
	readonly targets: readonly MigrationLabEndpoint[];
	readonly sampleFor: (id: string) => string;
	readonly migrate: (
		from: string,
		to: string,
		source: string,
	) => MigrationLabResult | MigrationLabError;
}

const SAMPLE_SOURCES: Readonly<Partial<Record<CodemodAdapterId, string>>> = {
	[CodemodAdapterId.Panda]: `import { css } from "@pandacss/dev";

const card = css({
	color: "red.500",
	padding: "4",
});`,
	[CodemodAdapterId.StyledComponents]: `import styled from "styled-components";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;`,
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
	[CodemodAdapterId.Stitches]: `import { styled } from "@stitches/react";

const Card = styled("div", {
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
	[CodemodAdapterId.Fela]: `import { createComponent } from "react-fela";

const Card = createComponent(() => ({
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

const Card = styled("div")({
	color: "red",
	padding: "1rem",
});`,
	[CodemodAdapterId.VueStyled]: `<script setup>
import styled from "vue3-styled-components";

const Card = styled.div({ color: "red", padding: "1rem" });
</script>`,
	[CodemodAdapterId.Tokenami]: `import { css } from "@tokenami/css";

const card = css({
	--color: "red",
	--padding: "1rem",
});`,
	[CodemodAdapterId.UnoCSS]: `<div class="text-red-500 p-4" />`,
	[CodemodAdapterId.ReactNative]: `import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
	card: {
		color: "red",
		padding: 16,
	},
});`,
	[CodemodAdapterId.Bamboo]: `import { styled } from "bamboo-css";

const Card = styled.div({ color: "red", padding: "1rem" });`,
	[CodemodAdapterId.Style9]: `import style9 from "style9";

const styles = style9.create({
	card: { color: "red", padding: 16 },
});`,
};

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

function fileFor(adapter: string): string {
	return adapter === CodemodAdapterId.VueStyled ? "Example.vue" : "Example.tsx";
}

/** Browser composition root for the same registry-backed migration use case as the CLI. */
export function createMigrationLab(): MigrationLab {
	const catalog = createBuiltinCodemodCatalog();
	const endpoints = catalog.adapters
		.toSorted((left, right) => labelFor(left).localeCompare(labelFor(right)))
		.map((adapter) => ({
			source: endpointFor(adapter, "source"),
			target: endpointFor(adapter, "target"),
			adapter,
		}));
	return {
		sources: endpoints.map(({ source }) => source),
		targets: endpoints.map(({ target }) => target),
		sampleFor: (id) =>
			SAMPLE_SOURCES[id as CodemodAdapterId] ??
			`// No built-in sample yet for ${id}. Paste a source file to try this adapter.`,
		migrate: (from, to, source) => {
			try {
				const result = runAdapterMigration(source, {
					from,
					to,
					file: fileFor(from),
					readFile: () => undefined,
					adapterRegistry: catalog.registry,
					mode: "safe",
				});
				return { ok: true, ...result };
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}

export const MIGRATION_LAB = createMigrationLab();
