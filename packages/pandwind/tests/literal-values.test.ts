import { describe, expect, it } from "vitest";
import { parseSync } from "oxc-parser";
import { evalLiteralValues, evalLiteral } from "../src/tw/literal";
import { NodeKind } from "../src/ast-node-kind.ts";

function evalSource(source: string) {
	const parsed = parseSync("test.tsx", source);
	const statement = parsed.program.body[0]!;
	const expression =
		statement.type === NodeKind.ExpressionStatement ? statement.expression : undefined;
	return evalLiteralValues(expression as never);
}

describe("evalLiteralValues", () => {
	it("single literal stays a set of one", () => {
		expect(evalSource(`"red"`)).toMatchInlineSnapshot(`
			{
			  "values": [
			    "red",
			  ],
			}
		`);
	});

	it("unresolvable identifier is unbounded", () => {
		expect(evalSource(`color`)).toMatchInlineSnapshot(`undefined`);
	});

	it("known constant resolves through scope", () => {
		const parsed = parseSync("test.tsx", `"500"`);
		const scope = new Map<string, unknown>([["shade", "500"]]);
		expect(evalLiteralValues(parsed.program.body[0] as never, scope)).toMatchInlineSnapshot(
			`undefined`,
		);
	});

	it("ternary enumerates both branches", () => {
		expect(evalSource(`condition ? "bg-red-500" : "bg-blue-500"`)).toMatchInlineSnapshot(`
			{
			  "values": [
			    "bg-red-500",
			    "bg-blue-500",
			  ],
			}
		`);
	});

	it("logical and enumerates falsy plus right values", () => {
		expect(evalSource(`active && "text-lg"`)).toMatchInlineSnapshot(`undefined`);
	});

	it("nullish coalescing falls back when left is unknown", () => {
		expect(evalSource(`shade ?? "blue.600"`)).toMatchInlineSnapshot(`undefined`);
	});

	it("array of constants enumerates", () => {
		expect(evalSource(`["1", "2"]`)).toMatchInlineSnapshot(`
			{
			  "values": [
			    [
			      "1",
			      "2",
			    ],
			  ],
			}
		`);
	});

	it("spreads and calls stay unbounded", () => {
		expect(evalSource(`[...unknown]`)).toMatchInlineSnapshot(`undefined`);
	});

	it("evalLiteral single-value contract unchanged", () => {
		expect(evalLiteral(undefined)).toBeUndefined();
	});
});

describe("evalLiteral object spreads", () => {
	it("folds spreads from proven object values and rejects unknown spreads", () => {
		const parsed = parseSync("test.tsx", 'const style = { ...base, color: "red", ...tail };');
		const statement = parsed.program.body[0]!;
		const expression =
			statement.type === NodeKind.VariableDeclaration ? statement.declarations[0]?.init : undefined;
		const constants = new Map<string, unknown>([
			["base", { padding: 2 }],
			["tail", { margin: 4 }],
		]);

		expect(evalLiteral(expression as never, constants)).toEqual({
			padding: 2,
			color: "red",
			margin: 4,
		});
		expect(evalLiteral(expression as never)).toBeUndefined();
	});

	it("coerces numeric object keys to their JavaScript property names", () => {
		const parsed = parseSync("test.ts", 'const values = { 0: "zero", 0.5: "half" };');
		const statement = parsed.program.body[0]!;
		const expression =
			statement.type === NodeKind.VariableDeclaration ? statement.declarations[0]?.init : undefined;

		expect(evalLiteral(expression as never)).toEqual({ "0": "zero", "0.5": "half" });
	});

	it("reads only own static properties from known object values", () => {
		const parsed = parseSync("test.ts", "palette.colors.fg");
		const statement = parsed.program.body[0]!;
		const expression =
			statement.type === NodeKind.ExpressionStatement ? statement.expression : undefined;
		const constants = new Map<string, unknown>([["palette", { colors: { fg: "#123456" } }]]);

		expect(evalLiteral(expression as never, constants)).toBe("#123456");

		const inherited = parseSync("test.ts", "palette.toString");
		const inheritedStatement = inherited.program.body[0]!;
		const inheritedExpression =
			inheritedStatement.type === NodeKind.ExpressionStatement
				? inheritedStatement.expression
				: undefined;
		expect(evalLiteral(inheritedExpression as never, constants)).toBeUndefined();
	});

	it("folds parenthesized static expressions", () => {
		const parsed = parseSync("test.ts", '("violet")');
		const statement = parsed.program.body[0]!;
		const expression =
			statement.type === NodeKind.ExpressionStatement ? statement.expression : undefined;

		expect(evalLiteral(expression as never)).toBe("violet");
	});
});
