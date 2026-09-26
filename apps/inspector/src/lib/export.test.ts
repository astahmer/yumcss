/** Export serializer tests — DTCG mapping, css vars, markdown, round-trip. */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	coverageToCsv,
	coverageToJson,
	coverageToMarkdown,
	downloadFile,
	themeVarsToCss,
	tokensToDtcg,
	tokensResolverToDtcg,
	utilitiesToJson,
} from "./export.ts";
import {
	parseDtcgResolverDocument,
	parseDtcgTokenDocument,
} from "pandwind-codemod/swap/token-document";
import type { InspectorPayload } from "../types.ts";

const tokenDocument = parseDtcgTokenDocument(
	JSON.stringify({
		colors: {
			$description: "Brand colors",
			$type: "color",
			"blue-500": {
				$value: { colorSpace: "srgb", components: [0.231, 0.51, 0.965], hex: "#3b82f6" },
			},
		},
		spacing: {
			gutter: { $type: "dimension", $value: { value: 8, unit: "px" } },
		},
	}),
);
const tokenSnapshot = {
	schema: "pandwind.interop.tokens/1" as const,
	state: "available" as const,
	source: {
		kind: "configured-token-module" as const,
		module: "fixture",
		fingerprint: tokenDocument.sourceFingerprint,
	},
	fidelity: { status: "lossless" as const, losses: [] },
	document: tokenDocument,
};

const payload: InspectorPayload = {
	meta: { root: "/repo" },
	interopTokens: tokenSnapshot,
	authoredCss: [],
	cssSources: [],
	cssDiagnostics: [],
	tokenGraph: { nodes: [], edges: [], cycles: [], orphans: [], reachability: {}, dangling: [] },
	coverage: {
		eliminatedPct: 46,
		entryEliminatedPct: 41,
		totalCxCalls: 92,
		fullFolded: 34,
		partialFolded: 8,
		runtimeCalls: 50,
		totalTwCalls: 126,
		twFolded: 104,
		totalMissingCss: 1,
		files: [
			// classDrillDown asserted separately

			{
				file: "a.tsx",
				eliminatedPct: 100,
				cxCalls: 2,
				cxFoldedFull: 2,
				cxFoldedPartial: 0,
				cxRuntime: 0,
				missingCssCount: 0,
			},
			{
				file: "b.tsx",
				eliminatedPct: 0,
				cxCalls: 1,
				cxFoldedFull: 0,
				cxFoldedPartial: 0,
				cxRuntime: 1,
				missingCssCount: 1,
			},
		],
		runtimeSites: [{ file: "b.tsx", line: 9, token: "props.tone" }],
		missingCssSites: [{ file: "b.tsx", line: 10, token: "bg-surface" }],
		budget: {
			cssBytes: 12175,
			cssGzipBytes: 3083,
			rules: 82,
			liveCandidates: 42,
			deadCandidates: 3,
			deadSample: ["py-0.5"],
			perPrefix: [{ prefix: "bg", rules: 12 }],
		},
		shape: {
			totalRules: 0,
			totalBytes: 0,
			categories: [],
			specificity: [],
		},
	},
	classDrillDown: [{ candidate: "px-2", rules: [] }],
	designSystem: {
		themeVars: [
			{ name: "--color-blue-500", value: "#3b82f6" },
			{ name: "--text-sm", value: "0.875rem" },
		],
		utilities: [{ key: "color", count: 60, sample: ["red-500"], openEnded: true }],
		variantCount: 88,
		conflictUtilities: 200,
		composeUtilities: 30,
		bridgeProperties: 68,
		bridgeMappings: 400,
		tokenSections: [
			{
				id: "colors",
				label: "colors",
				entries: [
					{ name: "$blue-500", value: "#3b82f6" },
					{ name: "$surface", value: '{"base":"#ffffff","dark":"#0b0b10"}' },
					{ name: "$gutter", value: "8px" },
				],
			},
		],
	},
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("tokensToDtcg", () => {
	test("exports the validated hierarchy and authored DTCG types without shape guessing", () => {
		const doc = JSON.parse(tokensToDtcg(payload)) as {
			colors: { $type: string; $description: string; "blue-500": { $value: { hex: string } } };
			spacing: { gutter: { $type: string; $value: { value: number; unit: string } } };
		};
		expect(doc.colors.$type).toBe("color");
		expect(doc.colors.$description).toBe("Brand colors");
		expect(doc.colors["blue-500"].$value.hex).toBe("#3b82f6");
		expect(doc.spacing.gutter).toEqual({ $type: "dimension", $value: { value: 8, unit: "px" } });
	});

	test("refuses a DTCG export when interop token provenance is unavailable", () => {
		const unavailable = {
			...payload,
			interopTokens: {
				schema: "pandwind.interop.tokens/1" as const,
				state: "unavailable" as const,
				source: null,
				fidelity: null,
				document: null,
				diagnostics: ["stale artifact"],
			},
		};
		expect(() => tokensToDtcg(unavailable)).toThrow("stale artifact");
	});

	test("exports DTCG Resolver contexts in a separate sidecar", () => {
		const withResolver: InspectorPayload = {
			...payload,
			interopTokens: {
				...tokenSnapshot,
				document: {
					...tokenDocument,
					resolver: parseDtcgResolverDocument(
						JSON.stringify({
							version: "2025.10",
							sets: { base: { sources: [{ $ref: "./base.tokens.json" }] } },
							modifiers: { mode: { contexts: { light: [{ $ref: "./light.tokens.json" }] } } },
							resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/mode" }],
						}),
					),
				},
			},
		};
		expect(tokensResolverToDtcg(withResolver)).toContain('"resolutionOrder"');
	});
});

test("themeVarsToCss emits a :root block with all vars", () => {
	const css = themeVarsToCss(payload);
	expect(css).toContain(":root {");
	expect(css).toContain("\t--color-blue-500: #3b82f6;");
	expect(css).toContain("\t--text-sm: 0.875rem;");
	expect(css.endsWith("}\n")).toBe(true);
});

test("themeVarsToCss preserves external selector scopes", () => {
	const scoped = {
		...payload,
		designSystem: {
			...payload.designSystem,
			themeVars: [
				{ name: "--color-base", value: "#fff" },
				{ name: "--color-base", value: "#111", scope: '[data-theme="dark"]' },
			],
		},
	};
	const css = themeVarsToCss(scoped);
	expect(css).toMatchInlineSnapshot(`
		":root {\n\t--color-base: #fff;\n}\n[data-theme="dark"] {\n\t--color-base: #111;\n}\n"
	`);
	expect(css).toContain('[data-theme="dark"] {');
});

test("utilitiesToJson carries meta + unions and round-trips", () => {
	const doc = JSON.parse(utilitiesToJson(payload)) as Record<string, unknown>;
	expect(doc["variantCount"]).toBe(88);
	expect((doc["unions"] as Array<Record<string, unknown>>)[0]).toMatchObject({
		key: "color",
		count: 60,
		openEnded: true,
	});
});

test("coverageToJson round-trips the coverage slice", () => {
	const doc = JSON.parse(coverageToJson(payload)) as { eliminatedPct: number; files: unknown[] };
	expect(doc.eliminatedPct).toBe(46);
	expect(doc.files).toHaveLength(2);
});

describe("coverageToMarkdown", () => {
	const md = coverageToMarkdown(payload);

	test("contains summary, per-file table, warnings and budget", () => {
		expect(md).toContain("# pandwind inspector report");
		expect(md).toContain("| eliminated | 46% (41% entry-level) |");
		expect(md).toContain("| a.tsx | 100% |");
		expect(md).toContain("`b.tsx:10` — `bg-surface`");
		expect(md).toContain("11.89 KB min / 3.01 KB gzip");
		expect(md).toContain("live/dead candidates: 42/3");
	});

	test("keeps every file row present", () => {
		expect(md).toContain("| b.tsx | 0% |");
	});
});

test("coverageToCsv emits per-file fold and value coverage", () => {
	const csv = coverageToCsv({
		...payload,
		analytics: {
			sitesScanned: 2,
			tokenUsage: [],
			unusedTokens: [],
			topProperties: [],
			topPropertyValues: [],
			conditions: [],
			conditionBreakdown: { responsive: 0, pseudo: 0, media: 0, other: 0 },
			valueCoverage: {
				tokenValues: 2,
				literalValues: 1,
				dynamicValues: 1,
				tokenPct: 67,
				literalPct: 33,
			},
			fileValueCoverage: [
				{
					file: "a.tsx",
					tokenValues: 2,
					literalValues: 1,
					dynamicValues: 1,
					tokenPct: 67,
					literalPct: 33,
				},
			],
		},
	});
	expect(csv).toContain("file,eliminated_pct,cx_calls");
	expect(csv).toContain("a.tsx,100,2,2,0,0,67,33,1,0");
	expect(csv).toContain("b.tsx,0,1,0,0,1,,,,1");
});

test("downloadFile creates an object URL, sets filename, clicks, revokes", () => {
	const revoke = vi.fn();
	const anchor = { href: "", download: "", click: vi.fn() };
	vi.stubGlobal("URL", {
		createObjectURL: vi.fn(() => "blob:x"),
		revokeObjectURL: revoke,
	});
	vi.stubGlobal("document", {
		createElement: vi.fn(() => anchor as unknown as HTMLAnchorElement),
	});
	downloadFile("tokens.json", "{}");
	expect(anchor.href).toBe("blob:x");
	expect(anchor.download).toBe("tokens.json");
	expect(anchor.click).toHaveBeenCalledTimes(1);
	expect(revoke).toHaveBeenCalledWith("blob:x");
});

import { coverageToHtml } from "./export.ts";

describe("coverageToHtml", () => {
	test("self-contained report embeds stats, files and missing-css", () => {
		const html = coverageToHtml(payload, "2026-01-01T00:00:00Z");
		expect(html).toContain("<!doctype html>");
		expect(html).toContain("<b>46%</b>");
		expect(html).toContain("<td>a.tsx</td>");
		expect(html).not.toContain("@import");
	});
});
