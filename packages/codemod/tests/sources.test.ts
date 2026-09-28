/**
 * Source-adapter routes.
 *
 * These fixtures exercise the registered source adapters directly. They keep
 * the target-native conversion and conservative host semantics visible without
 * relying on the removed regex mode façade.
 */
import { describe, expect, test } from "vitest";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

function migrate(source: string, from: CodemodAdapterId) {
	return runAdapterMigration(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file: "test.tsx",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});
}

describe("styled-components source adapter", () => {
	test("converts a static intrinsic component and its JSX host", () => {
		const result = migrate(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
				'export const App = () => <Card className="extra">content</Card>;',
			CodemodAdapterId.StyledComponents,
		);

		expect(result.changed).toBe(true);
		expect(result.converted).toBeGreaterThan(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("styled-components");
		expect(result.code).toContain("css.class");
		expect(result.code).toContain("<div");
		expect(result.code).toContain("extra");
	});

	test("converts a literal tagged template through the same route", () => {
		const result = migrate(
			'import styled from "styled-components";\n' +
				"const Link = styled.a`color: papayawhip; padding: 1rem;`;\n" +
				"export const App = () => <Link />;",
			CodemodAdapterId.StyledComponents,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("styled.a");
		expect(result.code).toContain("css.class");
	});

	test("keeps component inheritance as a component-level projection", () => {
		const result = migrate(
			'import styled from "styled-components";\n' +
				"const Link = (props: { href: string }) => <a {...props} />;\n" +
				'export const Card = styled(Link)({ color: "red" });',
			CodemodAdapterId.StyledComponents,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("export const Card");
		expect(result.code).toContain("Link");
		expect(result.code).not.toContain("styled(Link)");
	});

	test("preserves an unsupported runtime context beside a typed residual", () => {
		const result = migrate(
			'import { ThemeProvider } from "styled-components";\n' +
				"export const App = () => <ThemeProvider theme={theme}><div /></ThemeProvider>;",
			CodemodAdapterId.StyledComponents,
		);

		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.length).toBeGreaterThan(0);
		expect(result.code).toContain("ThemeProvider");
		expect(result.code).toContain("pandwind:migrate-skip");
	});

	test("does not treat styled syntax in comments as a source match", () => {
		const result = migrate(
			'import styled from "styled-components";\n' +
				"// const Fake = styled.div({ color: 'red' });\n" +
				'export const Card = styled.div({ color: "blue" });',
			CodemodAdapterId.StyledComponents,
		);

		expect(result.converted).toBe(1);
		expect(result.code).toContain("Fake = styled.div");
		expect(result.code).not.toContain("Fake = css.class");
	});
});

describe("StyleX source adapter", () => {
	test("converts literal stylex.create entries into Pandwind classes", () => {
		const result = migrate(
			'import * as stylex from "@stylexjs/stylex";\n' +
				'const styles = stylex.create({ card: { color: "#3182ce", padding: "1rem" } });\n' +
				"export const App = () => <div className={styles.card} />;",
			CodemodAdapterId.StyleX,
		);

		expect(result.changed).toBe(true);
		expect(result.converted).toBeGreaterThan(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("stylex.create");
		expect(result.code).not.toContain("@stylexjs/stylex");
		expect(result.code).toContain("css.class");
	});

	test("lowers a non-literal stylex value through Pandwind's dynamic carrier", () => {
		const result = migrate(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ card: { color: getColor() } });",
			CodemodAdapterId.StyleX,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("stylex.create");
		expect(result.code).toContain("css.vars");
		expect(result.code).toContain("getColor()");
	});

	test("resolves an aliased StyleX namespace import", () => {
		const result = migrate(
			'import * as sx from "@stylexjs/stylex";\n' +
				'const styles = sx.create({ card: { color: "red", padding: 8 } });\n' +
				"export const App = () => <div {...sx.props(styles.card)} />;",
			CodemodAdapterId.StyleX,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("sx.create");
		expect(result.code).not.toContain("sx.props");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ padding: "8px", color: "red" }) };
			export const App = () => <div {...css.props(styles.card)} />;"
		`);
	});

	test("resolves aliased named StyleX imports", () => {
		const result = migrate(
			'import { create as makeStyles, props as mergeProps } from "@stylexjs/stylex";\n' +
				'const styles = makeStyles({ card: { color: "red", padding: 8 } });\n' +
				"export const App = () => <div {...mergeProps(styles.card)} />;",
			CodemodAdapterId.StyleX,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("makeStyles");
		expect(result.code).not.toContain("mergeProps");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ padding: "8px", color: "red" }) };
			export const App = () => <div {...css.props(styles.card)} />;"
		`);
	});
});
