import { describe, expect, test } from "vitest";
import { extractArbitraryValueProposals } from "../src/arbitrary-values.ts";
import { createEmptyYumCSSMeta } from "../src/meta.ts";

const meta = createEmptyYumCSSMeta();
meta.variants = new Map([["hover", { join: ":" }]]);
meta.conflicts = new Map([
	["p", { "*": ["padding"] }],
	["w", { "*": ["width"] }],
]);
meta.tokens = {
	colors: { blue: "#3182ce" },
	spacing: { 2: "0.5rem", 4: "1rem" },
};

describe("arbitrary value proposals", () => {
	test("extracts static JSX class literals and groups repeated property values", () => {
		const report = extractArbitraryValueProposals(
			[
				{
					file: "Card.tsx",
					source: `
// <div className="p-[999px]" />
const classes = { className: "p-[1rem] hover:p-[1rem] [color:#3182cf]" };
export const Card = () => <div className="w-[37px] p-[1rem]" />;
`,
				},
			],
			meta,
		);

		expect(report.occurrences).toHaveLength(5);
		expect(report.proposals[0]).toMatchObject({
			value: "1rem",
			properties: ["padding"],
			count: 3,
			tokens: ["hover:p-[1rem]", "p-[1rem]"],
		});
		expect(report.proposals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					value: "#3182cf",
					properties: ["color"],
					nearestTokens: [expect.objectContaining({ group: "colors", key: "blue" })],
				}),
			]),
		);
	});

	test("can restrict the report to repeated proposals", () => {
		const report = extractArbitraryValueProposals(
			[
				{ file: "one.tsx", source: '<div className="p-[1rem]" />' },
				{ file: "two.tsx", source: '<div className="p-[1rem]" />' },
				{ file: "three.tsx", source: '<div className="w-[37px]" />' },
			],
			meta,
			{ minOccurrences: 2 },
		);
		expect(report.proposals).toHaveLength(1);
		expect(report.proposals[0]).toMatchObject({ value: "1rem", count: 2 });
	});
});
