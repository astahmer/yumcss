import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import { inlineCxCalls } from "pandwind/vite/cx-inline";
import { inlineTwCalls } from "pandwind/vite/inline";
import { NodeKind } from "../src/ast-node-kind.ts";
import plugin from "../src/index.ts";
import { CSS_PROPERTY_VALUES, CSS_WIDE_VALUES } from "../src/typed-css-values.ts";

type AstNode = { type: string; [key: string]: any };
type AstValue = AstNode | AstValue[] | null | undefined | string | number | boolean;
type RuleContext = {
	readonly options?: readonly unknown[];
	readonly settings?: Readonly<Record<string, unknown>>;
	readonly sourceCode?: {
		readonly text: string;
		readonly getAllComments?: () => readonly {
			type: string;
			value: string;
			start?: number;
			end?: number;
		}[];
	};
	report(payload: {
		data?: Record<string, unknown>;
		message: string;
		node?: AstNode;
		fix?: (fixer: RuleFixer) => unknown;
	}): void;
};
type FixEdit = { readonly range: readonly [number, number]; readonly text?: string };
type RuleFixer = {
	insertTextBefore(node: AstNode, text: string): FixEdit;
	removeRange(range: readonly [number, number]): FixEdit;
};
type RuleListeners = {
	Program?: (node: AstNode) => void;
	CallExpression?: (node: AstNode) => void;
};
type Plugin = { rules: Record<string, { create(context: RuleContext): RuleListeners }> };
type Report = {
	data: Record<string, unknown>;
	message: string;
	nodeType?: string;
	fixRange?: readonly [number, number];
	fixText?: string;
	fixes?: readonly FixEdit[];
};

const typedPlugin = plugin as unknown as Plugin;

const inlineCx = (source: string) =>
	inlineCxCalls(source, "fixture.tsx", { variants: {} }, new Set(["cx"]));

const inlineTw = (source: string) =>
	inlineTwCalls(source, "fixture.tsx", { variants: {} }, new Set(["tw"]));

const visitCalls = (program: AstValue, visit: (node: AstNode) => void): void => {
	const stack: AstValue[] = [program];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === null || typeof node !== "object") continue;
		if (Array.isArray(node)) {
			for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
			continue;
		}
		if (typeof node.type !== "string") continue;
		if (node.type === NodeKind.CallExpression) visit(node);
		for (const key of Object.keys(node)) {
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

const runRule = (
	ruleName: string,
	code: string | AstNode,
	options: readonly unknown[] = [],
	settings: Readonly<Record<string, unknown>> = {},
): Report[] => {
	const reports: Report[] = [];
	const parsed =
		typeof code === "string"
			? parseSync("fixture.tsx", code, { sourceType: "module", lang: "tsx" })
			: undefined;
	const context = {
		options,
		settings,
		sourceCode:
			typeof code === "string"
				? {
						text: code,
						getAllComments: () => parsed?.comments ?? [],
					}
				: undefined,
		report(payload: {
			data?: Record<string, unknown>;
			message: string;
			node?: AstNode;
			fix?: (fixer: RuleFixer) => unknown;
		}): void {
			const fix = payload.fix?.({
				insertTextBefore(node, text) {
					const start = typeof node.start === "number" ? node.start : 0;
					return { range: [start, start], text };
				},
				removeRange(range) {
					return { range };
				},
			});
			const edits = Array.isArray(fix) ? fix.filter(isFixEdit) : [];
			const singleEdit = !Array.isArray(fix) && isFixEdit(fix) ? fix : undefined;
			reports.push({
				data: payload.data ?? {},
				message: payload.message,
				nodeType: payload.node?.type,
				...(singleEdit?.text !== undefined || singleEdit === undefined
					? {}
					: { fixRange: singleEdit.range }),
				...(singleEdit?.text === undefined ? {} : { fixText: singleEdit.text }),
				...(edits.length === 0 ? {} : { fixes: edits }),
			});
		},
	};
	const rule = typedPlugin.rules[ruleName];
	if (rule === undefined) throw new Error(`unknown rule: ${ruleName}`);
	const listeners = rule.create(context);
	const program = parsed?.program as AstNode | undefined;
	const sourceProgram: AstNode = program ?? (code as AstNode);
	listeners.Program?.(sourceProgram);
	visitCalls(sourceProgram, (node) => listeners.CallExpression?.(node));
	return reports;
};

const isFixEdit = (value: unknown): value is FixEdit => {
	if (
		typeof value !== "object" ||
		value === null ||
		!("range" in value) ||
		!Array.isArray(value.range) ||
		value.range.length !== 2 ||
		typeof value.range[0] !== "number" ||
		typeof value.range[1] !== "number"
	)
		return false;
	return !("text" in value) || typeof value.text === "string";
};

const applyFixes = (source: string, fixes: readonly FixEdit[]): string => {
	let fixed = source;
	for (const fix of [...fixes].sort((left, right) => right.range[0] - left.range[0])) {
		fixed = `${fixed.slice(0, fix.range[0])}${fix.text ?? ""}${fixed.slice(fix.range[1])}`;
	}
	return fixed;
};

const staticBindingChain = (size: number): string =>
	[
		'import { tw } from "pandwind";',
		...Array.from({ length: size }, (_, index) => `const value${index} = value${index + 1};`),
		`const value${size} = "static";`,
		"tw(...values);",
	].join("\n");

describe("Pandwind Oxlint API binding resolution", () => {
	test("recognizes aliases and namespaces, while ignoring unrelated local functions", () => {
		const reports = runRule(
			"no-spreads",
			`import { cx as merge, tw as utility } from "pandwind";
import * as pw from "pandwind";
const cx = (...values) => values;
function render(cx: unknown) { cx(...items); }
merge(...items);
utility(...items);
pw.cx(...items);
cx(...items);`,
		);

		expect(reports).toHaveLength(3);
		expect(reports.map(({ data, nodeType }) => ({ data, nodeType }))).toMatchInlineSnapshot(`
      [
        {
          "data": {
            "name": "merge",
          },
          "nodeType": "SpreadElement",
        },
        {
          "data": {
            "name": "utility",
          },
          "nodeType": "SpreadElement",
        },
        {
          "data": {
            "name": "pw.cx",
          },
          "nodeType": "SpreadElement",
        },
      ]
    `);
	});

	test("recognizes css and design instances from their real subpath factories", () => {
		const reports = runRule(
			"no-dollar-raw",
			`import * as cssApi from "pandwind/unsafe/css";
import { createDesignCss as makeDesign } from "pandwind/design";
const css = cssApi.createUnsafeCss();
const dss = makeDesign(preset);
css({ $raw: { color: "green" } });
dss({ $raw: { color: "yellow" } });
css.class({ $raw: { color: "red" } });
dss.class({ $raw: { color: "blue" } });`,
		);

		expect(reports).toHaveLength(4);
		expect(reports.map(({ data }) => data.name)).toEqual(["css", "dss", "css.class", "dss.class"]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "name": "css",
			    },
			    "message": "pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
			    "nodeType": "Property",
			  },
			  {
			    "data": {
			      "name": "dss",
			    },
			    "message": "pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
			    "nodeType": "Property",
			  },
			  {
			    "data": {
			      "name": "css.class",
			    },
			    "message": "pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
			    "nodeType": "Property",
			  },
			  {
			    "data": {
			      "name": "dss.class",
			    },
			    "message": "pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
			    "nodeType": "Property",
			  },
			]
		`);
	});

	test("resolves explicitly configured local CSS instances", () => {
		const reports = runRule(
			"no-dollar-raw",
			`import { css } from "./css";
css.class({ $raw: { color: "red" } });`,
			[{ cssModules: [{ source: "./css", exports: ["css"] }] }],
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data.name).toBe("css.class");
	});

	test("discovers local style facades by Vite source basename", () => {
		const reports = runRule(
			"no-dollar-raw",
			`import { css as styles } from "../pandwind/css";
import { dss as design } from "../pandwind/design";
import * as cssModule from "../pandwind/css";
import { css as unrelated } from "../helpers/styles";
styles.class({ $raw: { color: "red" } });
design.class({ $raw: { color: "blue" } });
cssModule.css.class({ $raw: { color: "yellow" } });
cssModule.css({ $raw: { color: "purple" } });
unrelated.class({ $raw: { color: "green" } });`,
		);

		expect(reports).toHaveLength(4);
		expect(reports.map(({ data }) => data.name)).toEqual([
			"styles.class",
			"design.class",
			"cssModule.css.class",
			"cssModule.css",
		]);
	});

	test("does not invent a root css export or classify an unrelated factory", () => {
		const reports = runRule(
			"no-spreads",
			`import { css as rootCss } from "pandwind";
import { createCss as makeCss } from "other-library";
const css = makeCss();
css.class(...items);
rootCss(...items);`,
		);
		expect(reports).toEqual([]);
	});

	test("resolves configured CSS modules for extraction and JSX rules", () => {
		const settings = {
			"pandwind-extraction": {
				cssModules: [{ source: "../pandwind/css", exports: ["css"] }],
			},
		};
		const code = `import { css } from "../pandwind/css";
const className = css.class({ color: theme.colors.brand });
const element = <div {...css.props({ color: "red" })} className="custom" />;`;

		const unconfiguredDynamicReports = runRule("no-dynamic-values", code);
		const dynamicReports = runRule("no-dynamic-values", code, [], settings);
		const propReports = runRule("no-conflicting-style-props", code, [], settings);

		expect(unconfiguredDynamicReports).toEqual([]);
		expect(dynamicReports).toHaveLength(1);
		expect(dynamicReports[0]?.data).toEqual({ bad: "member expression value", name: "css.class" });
		expect(propReports.map(({ data }) => data.prop)).toEqual(["className"]);
	});

	test("limits arbitrary-value checks to class-string lanes", () => {
		const reports = runRule(
			"no-arbitrary-values",
			`import { tw } from "pandwind";
import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
tw("w-[13px]");
css.class({ color: "[red]" });`,
		);

		expect(reports).toHaveLength(1);
		expect(reports.at(0)?.data).toEqual({ name: "tw", value: "w-[13px]" });
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "name": "tw",
			      "value": "w-[13px]",
			    },
			    "message": "pandwind: arbitrary value "{{value}}" bypasses the design system — use a token ({{name}}() lane)",
			    "nodeType": "Literal",
			  },
			]
		`);
	});

	test("applies runtime diagnostics to aliased static-lane calls", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import { cx as merge } from "pandwind";
merge(
  \`text-\${size}\`,
  props.className,
  () => "font-bold"
);`,
		);

		expect(reports).toHaveLength(3);
		expect(reports.map(({ data }) => data.bad)).toEqual([
			"template interpolation",
			"member expression value",
			"function argument",
		]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "bad": "template interpolation",
			      "name": "merge",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
			    "nodeType": "TemplateLiteral",
			  },
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "merge",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			  {
			    "data": {
			      "bad": "function argument",
			      "name": "merge",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
			    "nodeType": "ArrowFunctionExpression",
			  },
			]
		`);
	});

	test("reports more than one partially foldable conditional", () => {
		const reports = runRule(
			"no-multiple-conditionals",
			`import { cx as utility } from "pandwind";
utility(active ? "opacity-100" : "opacity-50", disabled ? "cursor-not-allowed" : "cursor-pointer");`,
		);

		expect(reports).toHaveLength(1);
		expect(reports.at(0)?.data).toEqual({ n: 2, name: "utility" });
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "n": 2,
			      "name": "utility",
			    },
			    "message": "pandwind: {{n}} dynamic conditionals in one {{name}}() call — only one partially folds, split the call",
			    "nodeType": "CallExpression",
			  },
			]
		`);
	});
});

describe("Pandwind Oxlint static safety rules", () => {
	test("recognizes and unwraps all values in the typed CSS vocabulary", () => {
		const cases = [
			...Array.from(CSS_WIDE_VALUES, (value) => ({ property: "color", value })),
			...[...CSS_PROPERTY_VALUES].flatMap(([property, values]) =>
				Array.from(values, (value) => ({ property, value })),
			),
			{ property: "width", value: 12 },
			{ property: "height", value: -0.5 },
			{ property: "fontWeight", value: 700 },
		];
		const code = `import { createCss } from "pandwind/css";\nconst css = createCss(preset);\n${cases
			.map(({ property, value }) => `css({ $raw: { ${property}: ${JSON.stringify(value)} } });`)
			.join("\n")}`;
		const reports = runRule("prefer-typed-css-values", code);

		expect(reports).toHaveLength(cases.length);
		expect(reports.map(({ data }) => data.properties)).toEqual(
			cases.map(({ property }) => property),
		);
		expect(reports.every(({ fixes }) => fixes?.length === 2)).toBe(true);

		const fixed = applyFixes(
			code,
			reports.flatMap(({ fixes }) => fixes ?? []),
		);
		expect(fixed).not.toContain("$raw");
		for (const { property, value } of cases)
			expect(fixed).toContain(`${property}: ${JSON.stringify(value)}`);
	});

	test("keeps property-specific mismatches quiet and mixed values report-only", () => {
		const mismatchReports = runRule(
			"prefer-typed-css-values",
			`import { createCss } from "pandwind/css";
const css = createCss(preset);
css({ $raw: { width: "transparent", color: "auto", display: "auto", padding: "grid", fontWeight: "700" } });`,
		);
		const mixedReports = runRule(
			"prefer-typed-css-values",
			`import { createCss } from "pandwind/css";
const css = createCss(preset);
css({ $raw: { width: { _hover: "auto", _focus: "var(--runtime-width)" } } });`,
		);

		expect(mismatchReports).toEqual([]);
		expect(mixedReports).toHaveLength(1);
		expect(mixedReports[0]?.data.properties).toBe("width");
		expect(mixedReports[0]?.fixes).toBeUndefined();
	});

	test("unwraps independent typed properties from the middle of a raw object", () => {
		const code = `import { createCss } from "pandwind/css";
const css = createCss(preset);
css({ $raw: { height: "0.5rem", left: 0, right: 0, top: "-0.5rem" } });`;
		const reports = runRule("prefer-typed-css-values", code);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data.properties).toBe("left, right");
		expect(reports[0]?.fixes).toHaveLength(2);
		expect(
			applyFixes(
				code,
				reports.flatMap(({ fixes }) => fixes ?? []),
			),
		).toContain("left: 0, right: 0, $raw:");

		const mixedCode = `import { createCss } from "pandwind/css";
const css = createCss(preset);
css({ $raw: { fontWeight: "700", background: { base: "transparent", xl: "transparent" }, borderColor: { base: "transparent", xl: "nav.fg" }, boxShadow: { base: "none", xl: "none" } } });`;
		const mixedReports = runRule("prefer-typed-css-values", mixedCode);
		expect(mixedReports).toHaveLength(1);
		expect(mixedReports[0]?.fixes).toHaveLength(3);

		const tokenDependentCode = `import { createCss } from "pandwind/css";
const css = createCss(preset);
css.class({ _current: { color: { base: "nav.fg", xl: "component.nav.activeText" }, $raw: { fontWeight: "700", background: { base: "transparent", xl: "component.nav.activeBg" }, borderColor: { base: "transparent", xl: "nav.fg" }, boxShadow: { base: "none", xl: "chip" } } } });`;
		const tokenDependentReports = runRule("prefer-typed-css-values", tokenDependentCode);
		expect(tokenDependentReports).toHaveLength(1);
		expect(tokenDependentReports[0]?.fixes).toBeUndefined();

		const conflictingCode = `import { createCss } from "pandwind/css";
const css = createCss(preset);
css({ $raw: { background: "var(--image)", backgroundColor: "transparent", borderRadius: "0" } });`;
		const conflictingReports = runRule("prefer-typed-css-values", conflictingCode);
		expect(conflictingReports).toHaveLength(1);
		expect(conflictingReports[0]?.fixes).toBeUndefined();
	});

	test("recognizes typed values in a configured local CSS module", () => {
		const code = `import { css } from "./css";
css.class({ $raw: { width: "auto" } });`;
		const options = [{ cssModules: [{ source: "./css", exports: ["css"] }] }];
		const reports = runRule("prefer-typed-css-values", code, options);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data.properties).toBe("width");
		expect(applyFixes(code, reports[0]?.fixes ?? [])).toBe(
			`import { css } from "./css";
css.class({ width: "auto" });`,
		);
		expect(
			runRule(
				"prefer-typed-css-values",
				`import { css } from "./css";
css.class({ $raw: { width: "$width-1" } });`,
				options,
			),
		).toHaveLength(0);
	});

	test("recognizes typed values in an automatically discovered CSS facade", () => {
		const code = `import { css as styles } from "../pandwind/css";
styles.class({ $raw: { width: "auto" } });`;
		const reports = runRule("prefer-typed-css-values", code);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data.properties).toBe("width");
		expect(applyFixes(code, reports[0]?.fixes ?? [])).toBe(
			`import { css as styles } from "../pandwind/css";
styles.class({ width: "auto" });`,
		);
	});
	test("shares the Vite carrier analysis and accepts inlineable nested conditions", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const shade = getShade();
const Nested = () => <div {...css({ _hover: { backgroundColor: shade } })} />;`,
		);

		expect(reports).toEqual([]);
	});

	test("accepts inlineable dynamic values inside a raw subtree", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const shade = getShade();
const Raw = () => <div {...css({ padding: 2, $raw: { borderColor: shade } })} />;`,
		);

		expect(reports).toEqual([]);
	});

	test("reports dynamic spreads and ancestor/descendant collisions", () => {
		const spreadReports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const styles = getStyles();
const shade = getShade();
const Spread = () => <div {...css({ ...styles, color: shade })} />;`,
		);
		const collisionReports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const shade = getShade();
const Collision = () => <div {...css({ _hover: { color: shade }, _hover: "red" })} />;`,
		);

		expect(spreadReports).toHaveLength(1);
		expect(spreadReports[0]?.data).toEqual({
			reason: "dynamic spread",
			name: "css",
		});
		expect(collisionReports).toHaveLength(1);
		expect(collisionReports[0]?.data).toEqual({
			reason: "ancestor/descendant style collision",
			name: "css",
		});
	});

	test("accepts statically provable spreads", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		const base = { padding: 4 };
		const shade = getShade();
		const Card = () => <div {...css({ ...base, color: shade })} />;`,
		);

		expect(reports).toEqual([]);
	});

	test("reports unsupported function-valued carrier entries", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		const Card = () => <div {...css({ color: () => "red" })} />;`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data).toEqual({
			reason: "function-valued style entry",
			name: "css",
		});
	});

	test("does not report a statically provable fallback alias", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
import { firstThatWorks } from "pandwind/css";
const css = createUnsafeCss();
const displayFallback = firstThatWorks("flex", "block");
const shade = getShade();
const Card = () => <div {...css({ display: displayFallback, color: shade })} />;`,
		);

		expect(reports).toEqual([]);
	});

	test("reports non-static additional props on an explicit carrier", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
		const css = createUnsafeCss();
		const shade = getShade();
		const className = getClassName();
		const Card = () => <div {...css.props(css.vars({ color: shade }), className)} />;`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data).toEqual({ name: "css.vars" });
	});

	test("reports a dynamic fallback alias", () => {
		const reports = runRule(
			"no-dynamic-carrier-fallback",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
import { firstThatWorks } from "pandwind/css";
const css = createUnsafeCss();
const displayFallback = firstThatWorks(getDisplay(), "block");
const shade = getShade();
const Card = () => <div {...css({ display: displayFallback, color: shade })} />;`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data).toEqual({
			reason: "dynamic firstThatWorks fallback",
			name: "css",
		});
	});

	test("requires statically extractable keyframe bodies", () => {
		const reports = runRule(
			"no-dynamic-keyframes",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
	const css = createUnsafeCss();
	const moduleBody = { from: { opacity: 0 }, to: { opacity: 1 } };
	css.keyframes(moduleBody);
	function Card() {
	  const localBody = { from: { opacity: 0 } };
	  css.keyframes(localBody);
	  const dynamicBody = getBody();
	  css.keyframes(dynamicBody);
	  css.keyframes({ from: { opacity: getOpacity() } });
	}`,
		);

		expect(reports).toHaveLength(2);
		expect(reports.map(({ data, nodeType }) => ({ data, nodeType }))).toEqual([
			{ data: { name: "css.keyframes" }, nodeType: "Identifier" },
			{ data: { name: "css.keyframes" }, nodeType: "ObjectExpression" },
		]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "name": "css.keyframes",
			    },
			    "message": "pandwind: {{name}}() needs one static object literal body — keep every step and declaration literal or move @keyframes to authored CSS",
			    "nodeType": "Identifier",
			  },
			  {
			    "data": {
			      "name": "css.keyframes",
			    },
			    "message": "pandwind: {{name}}() needs one static object literal body — keep every step and declaration literal or move @keyframes to authored CSS",
			    "nodeType": "ObjectExpression",
			  },
			]
		`);
	});

	test("requires the owned AST identity table for parser node comparisons", () => {
		const reports = runRule(
			"no-raw-ast-identities",
			`const isCall = (node) => node.type === "CallExpression";
const isNotButton = (node) => node.type !== "Button";
const isTyped = (node) => node.type === NodeKind.CallExpression;`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({
			data: { value: "CallExpression" },
			message:
				"pandwind: raw parser node identity {{value}} must use NodeKind or the owning typed identity table",
			nodeType: "Literal",
		});
	});

	test("uses an explicit token policy instead of a hardcoded scale vocabulary", () => {
		const code = `import { createDesignCss } from "pandwind/design";
const dss = createDesignCss(preset);
dss.class({ $frame: { gap: "space-4", align: "center" } });`;
		const withoutPolicy = runRule("design-tokens-only", code);
		const withPolicy = runRule("design-tokens-only", code, [
			{ allowedPrefixes: ["$"], allowedValues: ["center", "space-4"] },
		]);

		expect(withoutPolicy).toEqual([]);
		expect(withPolicy).toHaveLength(0);
		expect(withPolicy).toMatchInlineSnapshot(`[]`);

		const strictReports = runRule(
			"design-tokens-only",
			`import { createDesignCss } from "pandwind/design";
const dss = createDesignCss(preset);
dss.class({ $frame: { gap: "space-5" } });`,
			[{ allowedPrefixes: ["$"], allowedValues: ["space-4"] }],
		);
		expect(strictReports).toHaveLength(1);
		expect(strictReports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "value": "space-5",
			    },
			    "message": "pandwind: "{{value}}" is not part of the configured design system — use a verified token or extend the project policy",
			    "nodeType": "Literal",
			  },
			]
		`);
	});

	test("consumes the shared governance TokenPolicySnapshot (plans/054)", () => {
		const policy = {
			owner: "pandwind",
			resolved: true,
			strictProperties: ["padding", "radius", "color"],
			allowedRawValuesByProperty: { padding: ["4px"] },
			tokenVocabulary: {
				padding: { "$space.4": "space::4" },
				radius: { "$radius.sm": "radii::sm" },
				color: { "red-500": "colors::red-500" },
			},
		};

		// verified tokens, declared property escape hatch, and non-strict props stay quiet
		const ok = runRule(
			"design-tokens-only",
			`import { createDesignCss } from "pandwind/design";
const dss = createDesignCss(preset);
dss.class({
  $frame: { padding: "$space.4", padding2: "4px", radius: "$radius.sm" },
  $text: { color: "red-500", weight: "bold" },
});`,
			[{ policy }],
		);
		expect(ok).toEqual([]);

		// unresolved policy is report-only/fail-open
		const badCode = `import { createDesignCss } from "pandwind/design";
const dss = createDesignCss(preset);
dss.class({
  $frame: { padding: "13px" },
  $text: { color: "chartreuse" },
});`;
		const unresolved = runRule("design-tokens-only", badCode, [
			{
				policy: { ...policy, resolved: false },
			},
		]);
		expect(unresolved).toEqual([]);

		// unknown raw literal in a strict property is reported with property provenance
		const reports = runRule("design-tokens-only", badCode, [{ policy }]);
		expect(reports).toHaveLength(2);
		expect(reports.map((r) => r.data)).toEqual([
			{ value: "13px", property: "padding" },
			{ value: "chartreuse", property: "color" },
		]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "property": "padding",
			      "value": "13px",
			    },
			    "message": "pandwind: "{{value}}" is not a verified token for "{{property}}" (strict policy) — use a project token or an explicit escape hatch",
			    "nodeType": "Literal",
			  },
			  {
			    "data": {
			      "property": "color",
			      "value": "chartreuse",
			    },
			    "message": "pandwind: "{{value}}" is not a verified token for "{{property}}" (strict policy) — use a project token or an explicit escape hatch",
			    "nodeType": "Literal",
			  },
			]
		`);
	});

	test("handles deeply nested generated ASTs without consuming the call stack", () => {
		let value: AstNode = { type: NodeKind.Literal, value: "w-[13px]" };
		for (let index = 0; index < 12_000; index += 1) {
			value = {
				type: NodeKind.ObjectExpression,
				properties: [
					{ type: NodeKind.Property, key: { type: NodeKind.Identifier, name: "value" }, value },
				],
			};
		}
		const program = {
			type: NodeKind.Program,
			body: [
				{
					type: NodeKind.ImportDeclaration,
					source: { type: NodeKind.Literal, value: "pandwind" },
					specifiers: [
						{
							type: NodeKind.ImportSpecifier,
							imported: { type: NodeKind.Identifier, name: "tw" },
							local: { type: NodeKind.Identifier, name: "tw" },
						},
					],
				},
				{
					type: NodeKind.ExpressionStatement,
					expression: {
						type: NodeKind.CallExpression,
						callee: { type: NodeKind.Identifier, name: "tw" },
						arguments: [value],
					},
				},
			],
		};
		const reports = runRule("no-arbitrary-values", program);
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchInlineSnapshot(`
			{
			  "data": {
			    "name": "tw",
			    "value": "w-[13px]",
			  },
			  "message": "pandwind: arbitrary value "{{value}}" bypasses the design system — use a token ({{name}}() lane)",
			  "nodeType": "Literal",
			}
		`);
	});

	test("keeps explicit runtime carriers quiet", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import { tw } from "pandwind";
import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const card = { color: "red", padding: "1rem" };
css.class(card);
css.vars({ color: theme.color });
css.props({ color: theme.color });
css.group({ color: theme.color });
css.input("color");
css.raw({ color: theme.color });`,
		);

		expect(reports).toEqual([]);
		expect(reports).toMatchInlineSnapshot(`[]`);
	});

	test("accepts static object spreads and reports runtime spread inputs", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
const layout = { flex: "1", overflow: "hidden" } as const;
css.class({ ...layout, display: compact ? "flex" : "block" });
css.class({ ...runtimeLayout });`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({
			data: { bad: "spread argument", name: "css.class" },
			nodeType: "SpreadElement",
		});
	});

	test("uses the Tw compiler's module-constant scope", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import { tw } from "pandwind";
const moduleColor = "red";
tw({ color: moduleColor });
function Card() {
	  const localColor = "blue";
	  tw({ color: localColor });
	  const dynamicColor = getColor();
	  tw({ color: dynamicColor });
	}`,
		);

		expect(inlineTw(`const moduleColor = "red";\ntw({ color: moduleColor });`).inlined).toBe(1);
		expect(reports).toHaveLength(2);
		expect(reports.map(({ data, nodeType }) => ({ data, nodeType }))).toEqual([
			{ data: { bad: "unresolved identifier", name: "tw" }, nodeType: "Identifier" },
			{ data: { bad: "unresolved identifier", name: "tw" }, nodeType: "Identifier" },
		]);
	});

	test("matches Tw compiler behavior for object constants and finite dynamic values", () => {
		const objectConstant = `import { tw } from "pandwind";
const card = { color: "red" };
tw(card);`;
		const conditionalValue = `import { tw } from "pandwind";
tw({ color: active ? "red" : "blue" });`;

		expect(inlineTw(objectConstant).inlined).toBe(0);
		expect(runRule("no-dynamic-values", objectConstant)).toHaveLength(1);
		expect(inlineTw(conditionalValue).inlined).toBe(0);
		expect(inlineTw(conditionalValue).candidates).toContain("color-red");
		expect(runRule("no-dynamic-values", conditionalValue)).toHaveLength(1);
	});

	test("reports nested dynamic values", () => {
		const dynamicReports = runRule(
			"no-dynamic-values",
			`import { tw } from "pandwind";
tw({ md: { hover: { color: theme.colors.brand } } });`,
		);

		expect(dynamicReports).toHaveLength(1);
		expect(dynamicReports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "tw",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			]
		`);
	});

	test("matches cx compiler cases for partial folding", () => {
		const cases = [
			{
				name: "one dynamic conditional",
				expression: 'cx(active ? "grid" : "block")',
				inlined: 1,
				dynamicValues: 0,
				conditions: 0,
			},
			{
				name: "nested conditions inside one foldable argument",
				expression: 'cx(active ? compact ? "px-2" : "px-4" : "p-6")',
				inlined: 1,
				dynamicValues: 0,
				conditions: 0,
			},
			{
				name: "logical and partial fold",
				expression: 'cx(active && "hidden")',
				inlined: 1,
				dynamicValues: 0,
				conditions: 0,
			},
			{
				name: "two dynamic arguments",
				expression: 'cx(active ? "grid" : "block", compact ? "flex" : "hidden")',
				inlined: 0,
				dynamicValues: 0,
				conditions: 2,
			},
			{
				name: "conditional nested in an array",
				expression: 'cx([active ? "grid" : "block"])',
				inlined: 0,
				dynamicValues: 1,
				conditions: 0,
			},
			{
				name: "unsupported logical or remains runtime",
				expression: 'cx(active || "grid")',
				inlined: 0,
				dynamicValues: 1,
				conditions: 0,
			},
			{
				name: "constant conditional tests fold statically",
				expression: 'cx(true ? "grid" : "block", false ? "flex" : "hidden")',
				inlined: 1,
				dynamicValues: 0,
				conditions: 0,
			},
		];

		for (const { name, expression, inlined, dynamicValues, conditions } of cases) {
			const source = `import { cx } from "pandwind";\n${expression};`;
			expect(inlineCx(expression).inlined, name).toBe(inlined);
			expect(runRule("no-dynamic-values", source), name).toHaveLength(dynamicValues);
			const reports = runRule("no-multiple-conditionals", source);
			expect(reports, name).toHaveLength(conditions === 0 ? 0 : 1);
			if (conditions > 0) expect(reports[0]?.data, name).toEqual({ n: conditions, name: "cx" });
		}

		const namespaceSource = `import * as pandwind from "pandwind";
pandwind.cx(active ? "grid" : "block", compact ? "flex" : "hidden");`;
		expect(
			inlineCxCalls(namespaceSource, "fixture.tsx", { variants: {} }, new Set(["cx"])).inlined,
		).toBe(0);
		expect(runRule("no-dynamic-values", namespaceSource)).toHaveLength(2);
		expect(runRule("no-multiple-conditionals", namespaceSource)).toEqual([]);
	});

	test("ignores type-only imports and preserves namespace method identity", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import type { tw as TypeOnlyTw } from "pandwind";
import * as cssApi from "pandwind/unsafe/css";
const css = cssApi.createUnsafeCss();
TypeOnlyTw(theme.value);
css.class(theme.value);
css.vars(theme.value);`,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.data).toEqual({ bad: "member expression value", name: "css.class" });
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "css.class",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			]
		`);
	});

	test("finds host prop conflicts created by css.props spreads", () => {
		const reports = runRule(
			"no-conflicting-style-props",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export function Card() {
  return <div {...css.props({ color: "red" })} className="extra" style={inlineStyle} />;
}`,
		);

		expect(reports).toHaveLength(2);
		expect(reports.map(({ data }) => data.prop)).toEqual(["className", "style"]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "prop": "className",
			    },
			    "message": "pandwind: explicit {{prop}} conflicts with css.props() output — merge the value before spreading host props",
			    "nodeType": "JSXAttribute",
			  },
			  {
			    "data": {
			      "prop": "style",
			    },
			    "message": "pandwind: explicit {{prop}} conflicts with css.props() output — merge the value before spreading host props",
			    "nodeType": "JSXAttribute",
			  },
			]
		`);
	});
});

describe("Pandwind migration hygiene rules", () => {
	test("requires a reason on migration skip markers", () => {
		const reports = runRule(
			"migration-skip-reason",
			`import { tw } from "pandwind";
// pandwind:migrate-skip
tw(theme.color);
// pandwind:migrate-skip (residual: runtime theme)
tw(theme.color);`,
		);

		expect(reports).toHaveLength(1);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "marker": "pandwind:migrate-skip",
			    },
			    "message": "pandwind: migration skip markers must include a reason describing the preserved residual",
			    "nodeType": "Line",
			  },
			]
		`);
	});

	test("flags stale skips but accepts a marked genuine residual", () => {
		const staleReports = runRule(
			"no-stale-migration-skip",
			`import { tw } from "pandwind";
// pandwind:migrate-skip (residual: old workaround)
tw("text-red-500");`,
		);
		const residualReports = runRule(
			"require-migration-residual",
			`import { tw } from "pandwind";
// pandwind:migrate-skip (residual: runtime theme)
tw(theme.color);`,
		);
		const missingReports = runRule(
			"require-migration-residual",
			`import { tw } from "pandwind";
tw(theme.color);`,
		);
		const runtimeSkipReports = runRule(
			"no-stale-migration-skip",
			`import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
// pandwind:migrate-skip (residual: runtime value)
css.vars({ color: theme.color });`,
		);

		expect(staleReports).toHaveLength(1);
		expect(staleReports[0]?.fixRange).toEqual([31, 82]);
		expect(staleReports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "name": "tw",
			    },
			    "fixRange": [
			      31,
			      82,
			    ],
			    "message": "pandwind: migration skip marker is stale because the following call is statically foldable",
			    "nodeType": "Line",
			  },
			]
		`);
		expect(residualReports).toEqual([]);
		expect(runtimeSkipReports).toEqual([]);
		expect(missingReports).toHaveLength(1);
		expect(missingReports[0]?.data).toEqual({ bad: "member expression value", name: "tw" });
	});

	test("offers a safe fixer that records an unmarked residual", () => {
		const code = `import { tw } from "pandwind";
tw(theme.color);`;
		const reports = runRule("require-migration-residual", code);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.fixText).toBe(
			"/* pandwind:migrate-skip (residual: member expression value) */ ",
		);
		const fixed = code.replace("tw(theme.color)", `${reports[0]?.fixText ?? ""}tw(theme.color)`);
		expect(runRule("require-migration-residual", fixed)).toEqual([]);
		expect(runRule("migration-skip-reason", fixed)).toEqual([]);
		expect(reports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "tw",
			    },
			    "fixText": "/* pandwind:migrate-skip (residual: member expression value) */ ",
			    "message": "pandwind: dynamic static-lane output must preserve a typed migration residual with pandwind:migrate-skip",
			    "nodeType": "MemberExpression",
			  },
			]
		`);
	});
});

describe("Pandwind Oxlint scaling", () => {
	test("keeps the full custom rule set linear in static declaration count", () => {
		const measure = (size: number): number => {
			const source = staticBindingChain(size).replace("tw(...values);", 'tw({ display: "flex" });');
			const started = Date.now();
			for (let sample = 0; sample < 3; sample += 1) {
				const program = parseSync("fixture.tsx", source, {
					sourceType: "module",
					lang: "tsx",
				}).program as AstNode;
				for (const ruleName of Object.keys(typedPlugin.rules))
					expect(runRule(ruleName, program), ruleName).toEqual([]);
			}
			return Date.now() - started;
		};
		const measureMedian = (size: number): number => {
			const samples: number[] = [];
			for (let sample = 0; sample < 3; sample += 1) samples.push(measure(size));
			samples.sort((left, right) => left - right);
			return samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
		};
		measure(150);
		measure(1_500);
		const smallMs = measureMedian(150);
		const largeMs = measureMedian(1_500);
		expect(largeMs / smallMs, `${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms`).toBeLessThan(
			24,
		);
	});

	test("scales with many calls that share module constants", () => {
		const measure = (size: number): number => {
			const source = [
				'import { tw } from "pandwind";',
				...Array.from({ length: size }, (_, index) => `const value${index} = "${index}";`),
				"function Component() {",
				...Array.from({ length: size }, (_, index) => `tw({ color: value${index} });`),
				"}",
			].join("\n");
			const programs = Array.from(
				{ length: 3 },
				() =>
					parseSync("fixture.tsx", source, { sourceType: "module", lang: "tsx" })
						.program as AstNode,
			);
			const started = Date.now();
			for (const program of programs) expect(runRule("no-dynamic-values", program)).toEqual([]);
			return Date.now() - started;
		};
		const measureMedian = (size: number): number => {
			const samples = [measure(size), measure(size), measure(size)].toSorted(
				(left, right) => left - right,
			);
			return samples[1] ?? Number.POSITIVE_INFINITY;
		};
		measure(100);
		measure(800);
		const smallMs = measureMedian(100);
		const largeMs = measureMedian(800);
		expect(largeMs / smallMs, `${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms`).toBeLessThan(
			24,
		);
	});
});
