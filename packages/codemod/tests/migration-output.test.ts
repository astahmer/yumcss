import { describe, expect, test } from "vitest";
import { MigrationOutput } from "../src/swap/migration-output.ts";

describe("MigrationOutput", () => {
	test("keeps type-only imports separate from value imports", () => {
		expect(
			MigrationOutput.consolidateImports([
				'import type { StyleProps } from "./css";',
				'import { css } from "./css";',
			]),
		).toEqual(['import { css } from "./css";', 'import type { StyleProps } from "./css";']);
	});

	test("removes redundant bare imports only when another import evaluates the module", () => {
		const runtimeImport = [
			'import "aphrodite";',
			'import { StyleSheet } from "aphrodite";',
			"export const styles = StyleSheet.create({});",
		].join("\n");
		expect(MigrationOutput.removeRedundantSideEffectImports(runtimeImport)).toBe(
			[
				'import { StyleSheet } from "aphrodite";',
				"export const styles = StyleSheet.create({});",
			].join("\n"),
		);
		const typeOnlyImport = 'import "types";\nimport { type Theme } from "types";';
		expect(MigrationOutput.removeRedundantSideEffectImports(typeOnlyImport)).toBe(typeOnlyImport);
	});

	test("cleans source imports from Vue script blocks using the shared parser", () => {
		const source = [
			"<script setup>",
			'import { styled } from "solid-styled-components";',
			"const Card = styled.div`color: red`;",
			"</script>",
			"<template><Card /></template>",
		].join("\n");
		const result = MigrationOutput.removeSourceImports(source, {
			modules: ["solid-styled-components"],
			reservedBindings: ["styled"],
			file: "App.vue",
		});
		expect(result).toContain('import "solid-styled-components";');
		expect(result).not.toContain('import { styled } from "solid-styled-components";');
		expect(result).toContain("const Card = styled.div`color: red`;");
		expect(result).toContain("<template><Card /></template>");
	});
});
