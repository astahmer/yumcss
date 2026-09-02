import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import plugin from "../src/index.ts";

type AstNode = { type: string; [key: string]: any };
type AstValue = AstNode | AstValue[] | null | undefined | string | number | boolean;
type RuleContext = {
	readonly options?: readonly unknown[];
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
type RuleFixer = {
	insertTextBefore(node: AstNode, text: string): { text: string };
	removeRange(range: readonly [number, number]): { range: readonly [number, number] };
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
};

const typedPlugin = plugin as unknown as Plugin;

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
		if (node.type === "CallExpression") visit(node);
		for (const key of Object.keys(node)) {
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

const runRule = (
	ruleName: string,
	code: string | AstNode,
	options: readonly unknown[] = [],
): Report[] => {
	const reports: Report[] = [];
	const parsed =
		typeof code === "string"
			? parseSync("fixture.tsx", code, { sourceType: "module", lang: "tsx" })
			: undefined;
	const context = {
		options,
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
				insertTextBefore(_node, text) {
					return { text };
				},
				removeRange(range) {
					return { range };
				},
			});
			reports.push({
				data: payload.data ?? {},
				message: payload.message,
				nodeType: payload.node?.type,
				...(typeof fix === "object" && fix !== null && "range" in fix
					? { fixRange: (fix as { range: readonly [number, number] }).range }
					: {}),
				...(typeof fix === "object" && fix !== null && "text" in fix
					? { fixText: (fix as { text: string }).text }
					: {}),
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
			`import * as cssApi from "pandwind/css";
import { createDesignCss as makeDesign } from "pandwind/design";
const css = cssApi.createCss();
const dcss = makeDesign(preset);
css({ $raw: { color: "green" } });
dcss({ $raw: { color: "yellow" } });
css.class({ $raw: { color: "red" } });
dcss.class({ $raw: { color: "blue" } });`,
		);

		expect(reports).toHaveLength(4);
		expect(reports.map(({ data }) => data.name)).toEqual([
			"css",
			"dcss",
			"css.class",
			"dcss.class",
		]);
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
			      "name": "dcss",
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
			      "name": "dcss.class",
			    },
			    "message": "pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
			    "nodeType": "Property",
			  },
			]
		`);
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

	test("limits arbitrary-value checks to class-string lanes", () => {
		const reports = runRule(
			"no-arbitrary-values",
			`import { tw } from "pandwind";
import { createCss } from "pandwind/css";
const css = createCss();
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
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
			    "nodeType": "TemplateLiteral",
			  },
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "merge",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			  {
			    "data": {
			      "bad": "function argument",
			      "name": "merge",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
			    "nodeType": "ArrowFunctionExpression",
			  },
			]
		`);
	});

	test("reports more than one partially foldable conditional", () => {
		const reports = runRule(
			"no-multiple-conditionals",
			`import { tw as utility } from "pandwind";
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
	test("uses an explicit token policy instead of a hardcoded scale vocabulary", () => {
		const code = `import { createDesignCss } from "pandwind/design";
const dcss = createDesignCss(preset);
dcss.class({ $frame: { gap: "space-4", align: "center" } });`;
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
const dcss = createDesignCss(preset);
dcss.class({ $frame: { gap: "space-5" } });`,
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

	test("handles deeply nested generated ASTs without consuming the call stack", () => {
		let value: AstNode = { type: "Literal", value: "w-[13px]" };
		for (let index = 0; index < 12_000; index += 1) {
			value = {
				type: "ObjectExpression",
				properties: [{ type: "Property", key: { type: "Identifier", name: "value" }, value }],
			};
		}
		const program = {
			type: "Program",
			body: [
				{
					type: "ImportDeclaration",
					source: { type: "Literal", value: "pandwind" },
					specifiers: [
						{
							type: "ImportSpecifier",
							imported: { type: "Identifier", name: "tw" },
							local: { type: "Identifier", name: "tw" },
						},
					],
				},
				{
					type: "ExpressionStatement",
					expression: {
						type: "CallExpression",
						callee: { type: "Identifier", name: "tw" },
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

	test("accepts local static constants and keeps explicit runtime carriers quiet", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import { tw } from "pandwind";
import { createCss } from "pandwind/css";
const css = createCss();
const card = { color: "red", padding: "1rem" };
tw(card);
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

	test("reports nested dynamic values while allowing one conditional", () => {
		const dynamicReports = runRule(
			"no-dynamic-values",
			`import { tw } from "pandwind";
tw({ md: { hover: { color: theme.colors.brand } } });`,
		);
		const conditionalReports = runRule(
			"no-multiple-conditionals",
			`import { tw } from "pandwind";
tw({ color: active ? "red" : "blue" }, disabled ? "opacity-50" : "opacity-100");`,
		);

		expect(dynamicReports).toHaveLength(1);
		expect(dynamicReports).toMatchInlineSnapshot(`
			[
			  {
			    "data": {
			      "bad": "member expression value",
			      "name": "tw",
			    },
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			]
		`);
		expect(conditionalReports).toHaveLength(1);
		expect(conditionalReports[0]?.data).toEqual({ n: 2, name: "tw" });
	});

	test("ignores type-only imports and preserves namespace method identity", () => {
		const reports = runRule(
			"no-dynamic-values",
			`import type { tw as TypeOnlyTw } from "pandwind";
import * as cssApi from "pandwind/css";
const css = cssApi.createCss();
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
			    "message": "pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
			    "nodeType": "MemberExpression",
			  },
			]
		`);
	});

	test("finds host prop conflicts created by css.props spreads", () => {
		const reports = runRule(
			"no-conflicting-style-props",
			`import { createCss } from "pandwind/css";
const css = createCss();
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
			`import { createCss } from "pandwind/css";
const css = createCss();
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
		const reports = runRule(
			"require-migration-residual",
			code,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.fixText).toBe(
			"/* pandwind:migrate-skip (residual: member expression value) */ ",
		);
		const fixed = code.replace(
			"tw(theme.color)",
			`${reports[0]?.fixText ?? ""}tw(theme.color)`,
		);
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
