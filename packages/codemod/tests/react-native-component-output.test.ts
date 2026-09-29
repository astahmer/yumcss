import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { runAdapterMigration } from "pandwind-codemod/swap";

const reactNativeProjectRoot = resolve(process.cwd(), "../../examples/rn-example");

const typecheckGeneratedProject = (source: string): string => {
	const directory = mkdtempSync(join(reactNativeProjectRoot, "src", "codemod-generated-"));
	try {
		writeFileSync(join(directory, "GeneratedCard.tsx"), source);
		return execFileSync(
			"pnpm",
			["exec", "tsc", "--noEmit", "--project", join(reactNativeProjectRoot, "tsconfig.json")],
			{ cwd: reactNativeProjectRoot, encoding: "utf8" },
		);
	} catch (error) {
		if (error instanceof Error && "stdout" in error && "stderr" in error)
			throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
		throw error;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

describe("React Native component output", () => {
	test("emits and typechecks a static reusable styled component with attrs", () => {
		const source =
			'import styled from "styled-components";\n' +
			'import { createRef } from "react";\n' +
			'export const Card = styled.div.attrs({ accessibilityLabel: "Saved" })({ backgroundColor: "red", padding: 2 });\n' +
			"const cardRef = createRef<HTMLElement>();\n" +
			'export const App = () => <Card accessibilityLabel="Caller" ref={cardRef} />;';
		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "react-native",
			file: "Card.tsx",
			mode: "safe",
			semantic: { source: { framework: "react" } },
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'import { StyleSheet, View, type ViewProps } from "react-native";',
		);
		expect(result.code).toContain("__pandwindForwardRef<ComponentRef<typeof View>, ViewProps>");
		expect(result.code).toContain("style={[style, props.style, attrs.style]}");
		expect(result.code).toContain('accessibilityLabel: "Saved"');
		expect(result.code).toContain('<Card accessibilityLabel="Caller" ref={cardRef} />');
		expect(result.code).not.toContain("styled-components");
		expect(typecheckGeneratedProject(result.code)).toBe("");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createRef } from "react";
			import { forwardRef as __pandwindForwardRef, type ComponentRef } from "react";
			import { StyleSheet, View, type ViewProps } from "react-native";
			export const Card = ((style: NonNullable<ViewProps["style"]>) => __pandwindForwardRef<ComponentRef<typeof View>, ViewProps>((props, ref) => { const attrs: Partial<ViewProps> = ({ accessibilityLabel: "Saved" }); return <View {...props} {...attrs} ref={ref} style={[style, props.style, attrs.style]} />; }))(StyleSheet.create({ style: { "backgroundColor": "red", "padding": 2 } }).style);
			const cardRef = createRef<HTMLElement>();
			export const App = () => <Card accessibilityLabel="Caller" ref={cardRef} />;"
		`);
	});
});
