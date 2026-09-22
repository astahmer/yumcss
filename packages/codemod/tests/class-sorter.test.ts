import { describe, expect, test } from "vitest";
import { createEmptyPandwindMeta } from "../src/meta.ts";
import {
	sortClassList,
	sortClassListDetailed,
	sortStaticClassSource,
} from "../src/class-sorter.ts";

const meta = createEmptyPandwindMeta();
meta.keys = [
	{ key: "padding", base: "p", valueType: "Spacing" },
	{ key: "paddingInline", base: "px", valueType: "Spacing" },
	{ key: "textColor", base: "text", valueType: "Colors" },
	{ key: "backgroundColor", base: "bg", valueType: "Colors" },
];
meta.keysByBase = new Map([
	["p", [meta.keys[0]!]],
	["px", [meta.keys[1]!]],
	["text", [meta.keys[2]!]],
	["bg", [meta.keys[3]!]],
]);
meta.variants = new Map([
	["hover", { join: ":" }],
	["md", { join: ":" }],
]);
meta.conflicts = new Map([
	["p", { "*": ["padding"] }],
	["px", { "*": ["padding-left", "padding-right"] }],
	["text", { "*": ["color"] }],
	["bg", { "*": ["background-color"] }],
]);

describe("conflict-aware class sorting", () => {
	test("uses generated utility order while preserving collision precedence", () => {
		expect(sortClassList("text-red-500 p-2 px-4 hover:p-1 bg-blue-500 text-blue-500", meta)).toBe(
			"p-2 px-4 text-red-500 text-blue-500 bg-blue-500 hover:p-1",
		);
	});

	test("keeps opaque plugin and arbitrary tokens as ordering barriers", () => {
		const result = sortClassListDetailed("text-red-500 plugin-card p-2 px-4", meta);
		expect(result.value).toBe("text-red-500 plugin-card p-2 px-4");
		expect(result.opaqueTokens).toEqual(["plugin-card"]);
	});

	test("sorts JSX attributes, object className values, and composition literals", () => {
		const source = `
// className: "text-red-500 p-2"
const props = { className: "text-red-500 p-2" };
export const View = () => <div className="text-red-500 p-2" data-x={cx("text-red-500 p-2")} />;
export const Expr = () => <div className={"bg-blue-500 p-2"} />;
`;
		const result = sortStaticClassSource(source, meta, "View.tsx");
		expect(result.changed).toBe(true);
		expect(result.edits).toBe(4);
		expect(result.code).toContain('className: "p-2 text-red-500"');
		expect(result.code).toContain('className="p-2 text-red-500"');
		expect(result.code).toContain('cx("p-2 text-red-500")');
		expect(result.code).toContain('className={"p-2 bg-blue-500"}');
		expect(result.code).toContain('// className: "text-red-500 p-2"');
	});
});
