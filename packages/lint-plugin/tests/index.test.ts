import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import plugin from "../src/index.ts";

type AstNode = { type: string; [key: string]: any };
type AstValue = AstNode | AstValue[] | null | undefined | string | number | boolean;
type RuleContext = {
	readonly options?: readonly unknown[];
	report(payload: { data?: Record<string, unknown>; message: string; node?: AstNode }): void;
};
type RuleListeners = {
	Program?: (node: AstNode) => void;
	CallExpression?: (node: AstNode) => void;
};
type Plugin = { rules: Record<string, { create(context: RuleContext): RuleListeners }> };
type Report = { data: Record<string, unknown>; message: string; nodeType?: string };

const typedPlugin = plugin as unknown as Plugin;
const parse = (code: string): AstNode =>
	parseSync("fixture.ts", code, { sourceType: "module", lang: "ts" }).program as AstNode;

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
	const context = {
		options,
		report(payload: { data?: Record<string, unknown>; message: string; node?: AstNode }): void {
			reports.push({
				data: payload.data ?? {},
				message: payload.message,
				nodeType: payload.node?.type,
			});
		},
	};
	const rule = typedPlugin.rules[ruleName];
	if (rule === undefined) throw new Error(`unknown rule: ${ruleName}`);
	const listeners = rule.create(context);
	const program = typeof code === "string" ? parse(code) : code;
	listeners.Program?.(program);
	visitCalls(program, (node) => listeners.CallExpression?.(node));
	return reports;
};

describe("Pandwind Oxlint API binding resolution", () => {
	test("recognizes aliases and namespaces, while ignoring unrelated local functions", () => {
		const reports = runRule(
			"no-spreads",
			`import { cx as merge, tw as utility } from "pandwind";
import * as pw from "pandwind";
const cx = (...values) => values;
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
});
