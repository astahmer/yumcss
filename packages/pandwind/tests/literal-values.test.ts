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
