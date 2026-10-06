/**
 * yumcss.agents.json — determinism + shape of the agent capability file
 * (plans/014 §5). The file is derived from real generated artifacts, so the
 * test runs codegen-shaped inputs through buildAgentsDocument and asserts:
 * stable output across runs, capped value lists with honest counts,
 * arbitrary escape-hatch detection, theme-scope extraction.
 */
import { describe, expect, test } from "vitest";
import {
	buildAgentsDocument,
	conflictsSummary,
	utilitiesFromTypesDts,
} from "../src/tw/agents-json.ts";
import { extractTwConfig } from "yumcss/vite/inline";

const TYPES = `
export type TextValue = WithOpacityModifiers<"sm" | "base" | ${JSON.stringify("xl")} | (string & {})>;
export type TextColorValue = WithOpacityModifiers<"gray-900" | "blue-500">;
export type FlexValue = "row" | "col";
`;

describe("utilitiesFromTypesDts", () => {
	test("extracts per-key values, counts and the arbitrary escape hatch", () => {
		const u = utilitiesFromTypesDts(TYPES);
		expect(u.text!.values).toEqual(["sm", "base", "xl"]);
		expect(u.text!.arbitrary).toBe(true);
		expect(u.text!.valueCount).toBe(3);
		expect(u.textColor!.values).toEqual(["gray-900", "blue-500"]);
		expect(u.flex!.arbitrary).toBe(false);
	});
});

describe("conflictsSummary", () => {
	test("dedupes property families per utility", () => {
		const s = conflictsSummary({
			text: { sm: ["font-size", "line-height"], blue: ["color"] },
			border: { red: ["border-color"] },
		});
		expect(s.text).toEqual(["font-size", "line-height", "color"]);
	});
});

describe("buildAgentsDocument — determinism + shape", () => {
	const themeBlock = `@theme {\n\t--color-surface: #fff;\n}\n\n[data-theme="dark"] {\n\t--color-surface: #000;\n}`;
	const config = extractTwConfig(
		[
			"export const __yumcssConfig = {",
			'  variants: { hover: { join: ":" }, dark: { join: "" } },',
			'  compose: ["shadow"],',
			'  conflicts: { text: { sm: ["font-size"] } }',
			"};",
			"export const tw = createTw(__yumcssConfig);",
		].join("\n"),
	)!;

	test("stable across runs", () => {
		const mk = () => buildAgentsDocument({ typesDts: TYPES, config, themeBlock });
		expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
	});

	test("shape: schema, workflows, artifactMap, scopes", () => {
		const doc = buildAgentsDocument({ typesDts: TYPES, config, themeBlock });
		expect(doc.schema).toBe("yumcss.agents/1");
		expect(doc.variants).toEqual(["hover", "dark"]);
		expect(doc.compose).toEqual(["shadow"]);
		expect(doc.themeScopes).toEqual(['[data-theme="dark"]']);
		expect(doc.semanticTokens["--color-surface"]).toBe("#fff");
		expect(doc.workflows.verifyTypes).toContain("typecheck");
		expect(doc.generatedFrom.types).toBe("types.d.ts");
		expect(doc.generatedFrom.interop).toBe("yumcss.interop.json");
		expect(Object.keys(doc.utilities)).toContain("text");
	});
});
