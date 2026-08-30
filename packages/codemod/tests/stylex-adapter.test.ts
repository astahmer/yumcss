import { describe, expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

describe("StyleX source adapter", () => {
	test("resolves bracketed token variables as computed custom-property keys", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				"const vars = { '--text-body-size': '--text-body-size' };",
				"const styles = stylex.create({ root: { [vars['--text-body-size']]: '1rem' } });",
				"export const View = () => <div {...stylex.props(styles.root)} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.props(styles.root)");
		expect(result.code).not.toContain("pandwind:migrate-skip");
	});

	test("allocates a collision-free generated binding beside a CSS module", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				'import css from "./View.module.css";',
				"const styles = stylex.create({ root: { color: 'red' } });",
				"export const View = () => <div {...stylex.props(styles.root)} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const pandwindCss = createCss();");
		expect(result.code).toContain("pandwindCss.group");
		expect(result.code).toContain("pandwindCss.props(styles.root)");
	});

	test("merges existing JSX className values after a generated props spread", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				'import css from "./View.module.css";',
				"const styles = stylex.create({ root: { display: 'block' } });",
				"export const View = () => <div {...stylex.props(styles.root)} className={css.root} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'[pandwindCss.props(styles.root).className, css.root].filter(Boolean).join(" ")',
		);
	});

	test("keeps WebkitLineClamp unitless", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				"const styles = stylex.create({ root: { WebkitLineClamp: 2 } });",
				"export const View = () => <div {...stylex.props(styles.root)} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("WebkitLineClamp: 2");
	});

	test("rewrites standalone props consumers of a migrated style group", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				'import { proseLinkStyles } from "./proseLink";',
				"export const Link = () => <a {...stylex.props(proseLinkStyles.underline)} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/Link.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/Link.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain("css.props(proseLinkStyles.underline)");
		expect(result.code).not.toContain("@stylexjs/stylex");
	});

	test("moves static xstyle host props to Pandwind className", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				"const styles = stylex.create({ version: { fontSize: '14.7cqw' } });",
				"export const View = () => <Text xstyle={styles.version}>0.5.0</Text>;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.props(styles.version).className}");
		expect(result.code).not.toContain("xstyle={styles.version}");
	});

	test("merges a static xstyle host prop with an existing className", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				'import css from "./View.module.css";',
				"const styles = stylex.create({ version: { fontSize: '14.7cqw' } });",
				"export const View = () => <Text xstyle={styles.version} className={css.version}>0.5.0</Text>;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'[pandwindCss.props(styles.version).className, css.version].filter(Boolean).join(" ")',
		);
		expect(result.code).not.toContain("xstyle={styles.version}");
	});

	test("preserves runtime xstyle carriers", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				"const styles = stylex.create({ root: { display: 'block' } });",
				"const dynamic = { size: (width: number) => ({ width }) };",
				"export const View = ({ width }: { width: number }) => <Text xstyle={[styles.root, dynamic.size(width)]} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.code).toContain("xstyle={[styles.root, dynamic.size(width)]}");
	});
});
