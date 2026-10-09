import { describe, expect, it } from "vitest";
import {
	collectTokenUsage,
	resolveUsageAgainstDefinitions,
	UNRESOLVED_TOKEN_ID,
} from "./usage-collector.ts";
import type { TokenDefinition, TokenPolicySnapshot } from "./contracts.ts";

const resolvedPolicy: TokenPolicySnapshot = {
	owner: "yumcss",
	resolved: true,
	strictProperties: ["color"],
	allowedRawValues: ["auto"],
	allowedRawPrefixes: ["calc("],
	allowedRawValuesByProperty: { padding: ["4px"] },
};

describe("collectTokenUsage", () => {
	it("records positioned, condition-scoped token usage", () => {
		const result = collectTokenUsage(
			[
				{
					file: "src/app.tsx",
					content: [
						'const a = tw({ bgColor: "$blue-500" });',
						'const b = tw({ hover: { color: "$red-500" } });',
					].join("\n"),
				},
			],
			null,
		);
		expect(result.usage).toHaveLength(2);
		expect(result.usage[0]).toMatchObject({
			tokenId: "$blue-500",
			property: "bgColor",
			strictness: "unknown",
			confidence: "inferred",
		});
		const hovered = result.usage[1]!;
		expect(hovered.condition).toBe("hover");
		expect(hovered.start).toBeGreaterThan(0);
		expect(hovered.end).toBeGreaterThan(hovered.start);
		expect(result.dynamicSites).toHaveLength(0);
	});

	it("classifies strictness against a resolved policy", () => {
		const content = [
			'const a = tw({ color: "$blue-500" });      // token ref in strict prop -> token',
			'const b = tw({ color: "auto" });           // allowed raw -> raw-allowed',
			'const c = tw({ color: "#fff" });           // strict prop, not allowed -> violation',
			'const d = tw({ padding: "4px" });          // property-allowed raw',
			'const e = tw({ width: "calc(1px + 2px)" }); // prefix-allowed',
		].join("\n");
		const result = collectTokenUsage([{ file: "a.tsx", content }], resolvedPolicy);
		const byProp = Object.fromEntries(result.usage.map((u) => [u.property, u]));
		expect(byProp.color?.strictness).toBe("raw-strict-violation");
		expect(byProp.padding?.strictness).toBe("raw-allowed");
		expect(byProp.width?.strictness).toBe("raw-allowed");
		// first file line only has color twice; check counts
		const colorUses = result.usage.filter((u) => u.property === "color");
		expect(colorUses.map((u) => u.strictness).toSorted()).toEqual([
			"raw-allowed",
			"raw-strict-violation",
			"token",
		]);
	});

	it("reports dynamic values as boundary sites, not token usage", () => {
		const content = [
			"const size = props.size;",
			"const a = tw({ padding: size });",
			"const b = tw({ padding: `calc(${size} + 4px)` });",
		].join("\n");
		const result = collectTokenUsage([{ file: "a.tsx", content }], resolvedPolicy);
		expect(result.usage).toHaveLength(0);
		expect(result.dynamicSites).toHaveLength(2);
		expect(result.dynamicSites.every((s) => s.tokenId === UNRESOLVED_TOKEN_ID)).toBe(true);
		expect(result.boundaryHits["dynamic-expression"]).toEqual(["a.tsx", "a.tsx"]);
	});

	it("ignores braces inside block comments when collecting dynamic sites", () => {
		const result = collectTokenUsage(
			[
				{
					file: "src/app.tsx",
					content: 'import { css } from "yumcss"; css({ /* } */ color: dynamicColor });',
				},
			],
			resolvedPolicy,
		);
		expect(result.usage).toEqual([]);
		expect(result.dynamicSites).toHaveLength(1);
		expect(result.boundaryHits["dynamic-expression"]).toEqual(["src/app.tsx"]);
	});

	it("keeps uppercase literal-like identifiers dynamic", () => {
		const result = collectTokenUsage(
			[
				{
					file: "a.tsx",
					content:
						"const values = [tw({ color: TRUE }), tw({ color: FALSE }), tw({ color: NULL }), tw({ color: true }), tw({ color: false }), tw({ color: null }), tw({ color: 1E3 })];",
				},
			],
			resolvedPolicy,
		);

		expect(result.dynamicSites.map((usage) => usage.rawValue)).toEqual(["TRUE", "FALSE", "NULL"]);
		expect(result.usage.map((usage) => usage.rawValue)).toEqual(["true", "false", "null", "1E3"]);
	});

	it("keeps an unresolved policy report-only (fail-open)", () => {
		const result = collectTokenUsage([{ file: "a.tsx", content: 'tw({ color: "#fff" })' }], {
			owner: "x",
			resolved: false,
		});
		expect(result.usage[0]!.strictness).toBe("unknown");
	});

	it("classifies bare vocabulary literals as verified token usage", () => {
		const vocabularyPolicy: TokenPolicySnapshot = {
			owner: "yumcss",
			resolved: true,
			strictProperties: ["color", "padding", "width"],
			origin: "official-loader",
			tokenVocabulary: {
				color: { red: "colors::red", "1/2": "$width" },
				padding: { "4": "spacing::4" },
				width: { "1/2": "sizes::1/2" },
			},
		};
		const content = [
			'const a = tw({ color: "red" });        // vocabulary bare name -> token',
			'const b = tw({ padding: "4" });        // vocabulary numeric name -> token',
			'const c = tw({ width: "1/2" });        // vocabulary fraction name -> token',
			'const d = tw({ color: "#abcdef" });    // not in vocabulary -> strict violation',
		].join("\n");
		const result = collectTokenUsage([{ file: "a.tsx", content }], vocabularyPolicy);
		const byValue = Object.fromEntries(
			result.usage.map((u) => [(u.rawValue ?? "").replace(/^["']|["']$/g, ""), u]),
		);
		expect(byValue.red?.strictness).toBe("token");
		expect(byValue["4"]?.strictness).toBe("token");
		expect(byValue["1/2"]?.strictness).toBe("token");
		// Vocabulary ids flow into the usage fact so reachability counts them.
		expect(byValue.red?.tokenId).toBe("colors::red");
		expect(result.usage.filter((u) => u.strictness === "raw-strict-violation")).toHaveLength(1);
	});

	it.each([
		[
			"named import aliases",
			'import { css as makeStyle } from "./css"; makeStyle({ color: "$colors.brand" });',
		],
		[
			"namespace imports",
			'import * as styles from "./css"; styles.css({ color: "$colors.brand" });',
		],
	])("collects token usage through %s", (_label, content) => {
		const result = collectTokenUsage([{ file: "src/app.ts", content }], resolvedPolicy);

		expect(result.usage).toHaveLength(1);
		expect(result.usage[0]).toMatchObject({
			tokenId: "$colors.brand",
			property: "color",
			strictness: "token",
		});
	});
});

describe("resolveUsageAgainstDefinitions", () => {
	const defs: Array<TokenDefinition> = [
		{
			id: "colors::red-500",
			group: "colors",
			name: "red-500",
			layer: "raw",
			value: "#E53E3E",
			provenance: [],
		},
		{ id: "semantic::surface", group: "semantic", name: "surface", layer: "scope", provenance: [] },
	];

	it("resolves group-qualified references", () => {
		const [resolved] = resolveUsageAgainstDefinitions(
			[
				{
					tokenId: "$colors.red-500",
					kind: "direct",
					file: "a.tsx",
					start: 0,
					end: 15,
					strictness: "token",
					confidence: "inferred",
				},
			],
			defs,
		);
		expect(resolved!.tokenId).toBe("colors::red-500");
		expect(resolved!.strictness).toBe("token");
	});

	it("resolves unique bare names and rejects ambiguous ones", () => {
		const [unique, ambiguous] = resolveUsageAgainstDefinitions(
			[
				{
					tokenId: "$surface",
					kind: "direct",
					file: "a.tsx",
					start: 0,
					end: 8,
					strictness: "token",
					confidence: "inferred",
				},
				{
					tokenId: "$missing",
					kind: "direct",
					file: "a.tsx",
					start: 9,
					end: 16,
					strictness: "token",
					confidence: "inferred",
				},
			],
			defs,
		);
		expect(unique!.tokenId).toBe("semantic::surface");
		expect(ambiguous!.strictness).toBe("unknown");
		expect(ambiguous!.confidence).toBe("unknown");
	});
});
