import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	externalIdentifier,
	runAdapterMigration,
} from "../src/swap/index.ts";
import type { AdapterNamedStyleUseContext } from "../src/swap/adapter-contract.ts";
import { createAdapterRouteSpec } from "./route-spec-support.ts";

const stylexToTailwind = createAdapterRouteSpec(CodemodAdapterId.StyleX, CodemodAdapterId.Tailwind);
const stylexToChakra = createAdapterRouteSpec(CodemodAdapterId.StyleX, CodemodAdapterId.ChakraUi);
const stylexToStitches = createAdapterRouteSpec(CodemodAdapterId.StyleX, CodemodAdapterId.Stitches);
const stylexToStyledComponents = createAdapterRouteSpec(
	CodemodAdapterId.StyleX,
	CodemodAdapterId.StyledComponents,
);
const catalog = createBuiltinCodemodCatalog();
const stylexHostSource = `import * as stylex from "@stylexjs/stylex";
const styles = stylex.create({ card: { color: "red" } });
export const Card = () => <div {...stylex.props(styles.card)} />;`;

describe("StyleX migration audit", () => {
	test("rewrites StyleX props spreads to the target class host", () => {
		const result = stylexToTailwind.run({
			source: `import * as stylex from "@stylexjs/stylex";
const styles = stylex.create({ card: { color: "red" } });
export const Card = () => <div {...stylex.props(styles.card)} />;`,
			file: "Card.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("@stylexjs/stylex");
		expect(result.code).not.toContain("stylex.props");
		expect(result.code).toContain("className={styles.card}");
		const repeated = stylexToTailwind.run({ source: result.code, file: "Card.tsx" });
		expect(repeated.code).toBe(result.code);
		expect(repeated.changed).toBe(false);
	});

	test("projects aliased StyleX props through Chakra's factory host", () => {
		const result = stylexToChakra.run({
			source: `import { create as defineStyles, props as applyStyles } from "@stylexjs/stylex";
const styles = defineStyles({ card: { color: "red" } });
export const Card = () => <div {...applyStyles(styles.card)} />;`,
			file: "Card.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("@stylexjs/stylex");
		expect(result.code).not.toContain("applyStyles");
		expect(result.code).toContain("<chakra.div css={styles.card} />");
		expect(result.code).toMatchInlineSnapshot(`
			"import { chakra, defaultSystem } from "@chakra-ui/react";
			const styles = { "card": defaultSystem.css({ color: "red" }) };
			export const Card = () => <chakra.div css={styles.card} />;"
		`);
	});

	test("preserves JSX comments and generic arguments during host projection", () => {
		const result = stylexToStitches.run({
			source:
				'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ card: { color: 'red' } });\n" +
				"export const Card = () => <Item<T> /* keep this comment */ {...stylex.props(styles.card)} />;",
			file: "Card.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<Item<T> /* keep this comment */ className={styles.card()} />");
		expect(result.code).not.toContain("stylex.props");
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@stitches/react";
			const styles = { "card": css({ color: "red" }) };
			export const Card = () => <Item<T> /* keep this comment */ className={styles.card()} />;"
		`);
	});

	test("reports unresolved StyleX props uses even when no style map converted", () => {
		const source =
			'import * as stylex from "@stylexjs/stylex";\n' +
			"export const Card = () => <div {...stylex.props(externalStyle)} />;";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.StyleX,
			to: CodemodAdapterId.Tailwind,
			file: "Card.tsx",
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.map((residual) => residual.hint)).toContain(
			"StyleX props use require one converted style reference and a target-native host projection",
		);
		expect(result.code.endsWith(source)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`
			"// yumcss:migrate-skip (route: stylex -> tailwind | lowering-residual: host-framework)
			import * as stylex from "@stylexjs/stylex";
			export const Card = () => <div {...stylex.props(externalStyle)} />;"
		`);
	});

	test("uses a registered target substitute's named-style host projection", () => {
		const source =
			'import * as stylex from "@stylexjs/stylex";\n' +
			"const styles = stylex.create({ card: { color: 'red' } });\n" +
			"export const Card = () => <div {...stylex.props(styles.card)} />;";
		const stitches = catalog.registry.get(CodemodAdapterId.Stitches)!;
		const targetId = externalIdentifier("stylex-host-projection-test");
		let projected = false;
		const substitute = {
			...stitches,
			id: targetId,
			capabilities: { ...stitches.capabilities, adapter: targetId },
			migration: {
				...stitches.migration,
				targetPolicy: {
					...stitches.migration?.targetPolicy,
					projectNamedStyleUse: (context: AdapterNamedStyleUseContext) => {
						projected = true;
						return {
							hostTag: context.hostTag,
							attributes: ["className={" + context.styleExpression + "()}"],
							residuals: [],
						};
					},
				},
			},
		};
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.StyleX,
			to: targetId,
			file: "Card.tsx",
			adapterRegistry: createStyleAdapterRegistry([
				catalog.registry.get(CodemodAdapterId.StyleX)!,
				substitute,
			]),
		});

		expect(projected).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={styles.card()}");
	});

	test("preserves polymorphic wrappers whose StyleX props result has no proven target projection", () => {
		const source =
			'import * as stylex from "@stylexjs/stylex";\n' +
			"const __CardStyle = stylex.create({ style: { color: 'red', padding: '1rem' } }).style;\n" +
			'export const Card = (props) => { const Component = props.as ?? "div"; const styleProps = stylex.props(__CardStyle); return <Component {...props} className={[styleProps.className, props.className].filter(Boolean).join(" ")} style={{ ...styleProps.style, ...props.style }} />; };';
		const result = stylexToStyledComponents.run({ source, file: "Card.tsx" });

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.map((residual) => residual.hint)).toContain(
			"StyleX props use require one converted style reference and a target-native host projection",
		);
		expect(result.code.endsWith(source)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`
			"// yumcss:migrate-skip (route: stylex -> styled-components | lowering-residual: host-framework)
			import * as stylex from "@stylexjs/stylex";
			const __CardStyle = stylex.create({ style: { color: 'red', padding: '1rem' } }).style;
			export const Card = (props) => { const Component = props.as ?? "div"; const styleProps = stylex.props(__CardStyle); return <Component {...props} className={[styleProps.className, props.className].filter(Boolean).join(" ")} style={{ ...styleProps.style, ...props.style }} />; };"
		`);
	});

	test("preserves multiple StyleX prop spreads whose target class merge order is unknown", () => {
		const source =
			'import * as stylex from "@stylexjs/stylex";\n' +
			"const styles = stylex.create({ normal: { color: 'red' }, active: { color: 'blue' } });\n" +
			"export const Card = () => <div {...stylex.props(styles.normal)} {...stylex.props(styles.active)} />;";
		const result = stylexToTailwind.run({ source, file: "Card.tsx" });

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.map((residual) => residual.hint)).toContain(
			"Multiple StyleX props spreads on one host require a target-specific merge strategy",
		);
		expect(result.code.endsWith(source)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`
			"// yumcss:migrate-skip (route: stylex -> tailwind | lowering-residual: host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ normal: { color: 'red' }, active: { color: 'blue' } });
			export const Card = () => <div {...stylex.props(styles.normal)} {...stylex.props(styles.active)} />;"
		`);
	});

	test("preserves multi-style StyleX props when class precedence cannot be expressed", () => {
		const source = `import * as stylex from "@stylexjs/stylex";
const styles = stylex.create({ normal: { color: "red" }, active: { color: "blue" } });
export const Card = ({ active }) => <div {...stylex.props(styles.normal, active && styles.active)} />;`;
		const result = stylexToTailwind.run({ source, file: "Card.tsx" });

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.map((residual) => residual.hint)).toContain(
			"StyleX props use require one converted style reference and a target-native host projection",
		);
		expect(result.code.endsWith(source)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`
			"// yumcss:migrate-skip (route: stylex -> tailwind | lowering-residual: host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ normal: { color: "red" }, active: { color: "blue" } });
			export const Card = ({ active }) => <div {...stylex.props(styles.normal, active && styles.active)} />;"
		`);
	});

	test("audits StyleX props host use through every outbound adapter", () => {
		const reports = catalog.registry.adapters
			.filter((adapter) => adapter.id !== CodemodAdapterId.StyleX)
			.map((adapter) => {
				const result = runAdapterMigration(stylexHostSource, {
					from: CodemodAdapterId.StyleX,
					to: adapter.id,
					file: "Card.tsx",
				});
				return {
					target: adapter.id,
					converted: result.converted,
					skipped: result.skipped,
					residuals: result.residuals.map((residual) => residual.hint),
					code: result.code,
				};
			});

		expect(reports).toHaveLength(catalog.registry.adapters.length - 1);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ color: "red" }) };
			export const Card = () => <div {...css.props(styles.card)} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "yumcss",
			  },
			  {
			    "code": "import { css } from "styled-system/css";
			const styles = { "card": css({ color: "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "bamboo",
			  },
			  {
			    "code": "import { chakra, defaultSystem } from "@chakra-ui/react";
			const styles = { "card": defaultSystem.css({ color: "red" }) };
			export const Card = () => <chakra.div css={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "chakra-ui",
			  },
			  {
			    "code": "import { css } from "@emotion/css";
			const styles = { "card": css({ color: "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "emotion",
			  },
			  {
			    "code": "import styled from "styled-components";
			const styles = { "card": styled.div({ color: "red" }) };
			export const Card = () => <styles.card  />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "styled-components",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> vanilla-extract | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "Vanilla Extract styles must be emitted from a .css.ts module",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "vanilla-extract",
			  },
			  {
			    "code": "import { css } from "@stitches/react";
			const styles = { "card": css({ color: "red" }) };
			export const Card = () => <div className={styles.card()} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "stitches",
			  },
			  {
			    "code": "import { css } from "@linaria/core";
			const styles = { "card": css\`color: red;\` };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "linaria",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> mantine | lowering-residual: host-framework, validation)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "Mantine style maps require a host component style prop or an explicit CSS module",
			      "1 residual conversion(s)",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "mantine",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> mui | lowering-residual: host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "MUI sx output requires a MUI-owned component or an intrinsic host that can accept sx",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "mui",
			  },
			  {
			    "code": "import { css } from "next-yak";
			const styles = { "card": css\`color: red;\` };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "next-yak",
			  },
			  {
			    "code": "import { css } from "styled-system/css";
			const styles = { "card": css({ color: "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "panda",
			  },
			  {
			    "code": "const styles = { "card": "[color:red]" };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "tailwind",
			  },
			  {
			    "code": "import { createUseStyles } from "react-jss";
			const styles = createUseStyles({ card: { color: "red" } });
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "jss",
			  },
			  {
			    "code": "import { css, html } from "react-strict-dom";
			const styles = { "card": css.create({ color: "red" }) };
			export const Card = () => <html.div style={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "react-strict-dom",
			  },
			  {
			    "code": "const styles = { "card": renderer.renderRule({ "color": "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "fela",
			  },
			  {
			    "code": "import { css } from "goober";
			const styles = { "card": css({ "color": "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "goober",
			  },
			  {
			    "code": "import { StyleSheet } from "aphrodite";
			const styles = StyleSheet.create({ "card": { "color": "red" } });
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "aphrodite",
			  },
			  {
			    "code": "import style9 from "style9";
			const styles = { "card": style9.create({ "color": "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "style9",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> treat | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "Treat styles must be emitted from a .treat.ts or .treat.js module",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "treat",
			  },
			  {
			    "code": "import { css } from "@compiled/react";
			const styles = { "card": css({ "color": "red" }) };
			export const Card = () => <div className={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "compiled",
			  },
			  {
			    "code": "import { css } from "solid-styled-components";
			const styles = { "card": css({ "color": "red" }) };
			export const Card = () => <div class={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "solid-styled",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> vue-styled | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "named-rules: named style rule: card",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "vue-styled",
			  },
			  {
			    "code": "import { StyleSheet, View } from "react-native";
			const styles = StyleSheet.create({ "card": { "color": "red" } });
			export const Card = () => <View style={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "react-native",
			  },
			  {
			    "code": "import { css } from "@tokenami/css";
			const styles = { "card": css({ "--color": "red" }) };
			export const Card = () => <div style={styles.card} />;",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "tokenami",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> unocss | lowering-residual: configuration, validation, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "the official UnoCSS generator did not prove this emitted utility",
			      "UnoCSS output requires the target project's official config and generator",
			      "canonical CSS differs or has residuals",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "unocss",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> authored-css | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "authored-css",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> css-modules | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "css-modules",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> sass | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "sass emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "sass",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> less | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "less emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "less",
			  },
			  {
			    "code": "// yumcss:migrate-skip (route: stylex -> tamagui | lowering-residual: capability, host-framework)
			import * as stylex from "@stylexjs/stylex";
			const styles = stylex.create({ card: { color: "red" } });
			export const Card = () => <div {...stylex.props(styles.card)} />;",
			    "converted": 0,
			    "residuals": [
			      "named-rules: named style rule: card",
			      "StyleX props use require one converted style reference and a target-native host projection",
			    ],
			    "skipped": 1,
			    "target": "tamagui",
			  },
			]
		`);
		const converted = reports.filter((report) => report.residuals.length === 0);
		const residual = reports.filter((report) => report.residuals.length > 0);
		expect(converted.every((report) => report.converted === 1 && report.skipped === 0)).toBe(true);
		expect(
			converted.every(
				(report) =>
					!report.code.includes("@stylexjs/stylex") && !report.code.includes("stylex.props"),
			),
		).toBe(true);
		expect(
			residual.filter(
				(report) =>
					report.converted !== 0 ||
					report.code.replace(/^[^\n]*yumcss:migrate-skip[^\n]*\n?/gmu, "") !== stylexHostSource,
			),
		).toEqual([]);
	});
});
