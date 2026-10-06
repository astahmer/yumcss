import { describe, expect, test } from "vitest";
import {
	createTokenDocument,
	TokenFormatId,
	TOKEN_RESOLVER_SCHEMA,
} from "@yumcss/codemod/swap/token-document";
import { buildTokenGovernanceReport } from "./report.ts";
import { compareTokenRelease } from "./release.ts";
import type { TokenDefinition, TokenUsage } from "./contracts.ts";

const token = (
	value: string,
	extra: Partial<{
		type: string;
		deprecated: boolean | string;
		description: string;
	}> = {},
) => ({
	kind: "token" as const,
	...extra,
	value: { kind: "string" as const, value },
});

const document = (options: {
	readonly colorType?: string;
	readonly primary: string;
	readonly accent?: string;
	readonly old?: string;
	readonly resolverValue?: string;
	readonly deprecated?: boolean | string;
}) =>
	createTokenDocument({
		format: TokenFormatId.Preset,
		formatVersion: "yumcss.preset/1",
		root: {
			kind: "group",
			children: {
				colors: {
					kind: "group",
					...(options.colorType === undefined ? { type: "color" } : { type: options.colorType }),
					children: {
						primary: token(
							options.primary,
							options.deprecated === undefined ? {} : { deprecated: options.deprecated },
						),
						...(options.accent === undefined ? {} : { accent: token(options.accent) }),
						...(options.old === undefined ? {} : { old: token(options.old) }),
					},
				},
			},
		},
		...(options.resolverValue === undefined
			? {}
			: {
					resolver: {
						schema: TOKEN_RESOLVER_SCHEMA,
						version: "2025.10",
						sets: { base: { sources: [{ $ref: options.resolverValue }] } },
						modifiers: {},
						resolutionOrder: [{ $ref: "#/sets/base" }],
					},
				}),
	});

const definition = (name: string, value: string): TokenDefinition => ({
	id: `colors::${name}`,
	group: "colors",
	name,
	layer: "raw",
	value,
	provenance: [{ source: "official-config", origin: "fixture" }],
});

const usage = (tokenId: string): TokenUsage => ({
	tokenId,
	kind: "direct",
	file: "src/card.tsx",
	start: 10,
	end: 24,
	property: "color",
	strictness: "token",
	confidence: "verified",
});

const governance = () =>
	buildTokenGovernanceReport({
		root: "/consumer",
		definitions: [definition("primary", "#f00"), definition("accent", "#0f0")],
		usage: [usage("colors::primary")],
		suggestions: [
			{
				file: "src/card.tsx",
				start: 10,
				end: 24,
				property: "color",
				rawValue: "#f00",
				tokenId: "colors::primary",
				replacement: "$colors.primary",
				reason: "exact property-aware value match",
				confidence: "verified",
			},
		],
		unusedCandidates: [],
		diagnostics: [],
		boundaryHits: { "dynamic-expression": ["*"] },
	});

describe("compareTokenRelease", () => {
	test("classifies path changes as add and remove without guessing a rename", () => {
		const report = compareTokenRelease({
			baseline: document({ primary: "#111", old: "#0af" }),
			current: document({ primary: "#111", accent: "#0af" }),
			consumers: [governance()],
			generatedAt: "2026-01-01T00:00:00.000Z",
		});
		expect(report.schema).toBe("yumcss.token-release/1");
		expect(report.changes.filter(({ path }) => path.endsWith("/old"))).toMatchObject([
			{ kind: "removed", path: "/colors/old", tokenIds: [] },
		]);
		expect(report.changes.filter(({ path }) => path.endsWith("/accent"))).toMatchObject([
			{ kind: "added", path: "/colors/accent", tokenIds: ["colors::accent"] },
		]);
		expect(report.changes.some((change) => "replacement" in change)).toBe(false);
	});

	test("reports effective type, value, deprecation, and matched usage with coverage boundaries", () => {
		const report = compareTokenRelease({
			baseline: document({ primary: "#111" }),
			current: document({
				primary: "#222",
				colorType: "dimension",
				deprecated: "Use another token.",
			}),
			consumers: [governance()],
		});
		const primaryChanges = report.changes.filter(({ path }) => path === "/colors/primary");
		expect(primaryChanges.map(({ kind }) => kind)).toEqual([
			"deprecation-changed",
			"type-changed",
			"value-changed",
		]);
		for (const change of primaryChanges) {
			expect(change.consumers[0]?.usages).toEqual([usage("colors::primary")]);
			expect(change.consumers[0]?.exactSuggestions).toMatchObject([
				{ tokenId: "colors::primary", replacement: "$colors.primary", confidence: "verified" },
			]);
			expect(change.consumers[0]?.coverageBoundaries["dynamic-expression"]).toBeGreaterThan(0);
		}
	});

	test("keeps resolver context changes distinct from token value changes", () => {
		const report = compareTokenRelease({
			baseline: document({ primary: "#111", resolverValue: "./light.tokens.json" }),
			current: document({ primary: "#111", resolverValue: "./dark.tokens.json" }),
			consumers: [governance()],
		});
		expect(report.changes).toContainEqual(
			expect.objectContaining({
				kind: "context-changed",
				path: "/resolver/sets/base/sources/0/$ref",
				before: "./light.tokens.json",
				after: "./dark.tokens.json",
				tokenIds: [],
			}),
		);
	});

	test("reports inline context value changes against exact governance identities", () => {
		const contextualDocument = (dark: string) =>
			createTokenDocument({
				format: TokenFormatId.Preset,
				root: {
					kind: "group",
					children: {
						colors: {
							kind: "group",
							type: "color",
							children: {
								primary: {
									kind: "token",
									value: {
										kind: "contextual",
										source: "preset",
										values: {
											base: { kind: "string", value: "#111" },
											dark: { kind: "string", value: dark },
										},
									},
								},
							},
						},
					},
				},
			});
		const report = compareTokenRelease({
			baseline: contextualDocument("#222"),
			current: contextualDocument("#333"),
			consumers: [governance()],
		});

		expect(report.changes).toContainEqual(
			expect.objectContaining({
				kind: "context-changed",
				path: "/colors/primary/$value/$contexts/preset/dark",
				before: { kind: "string", value: "#222" },
				after: { kind: "string", value: "#333" },
				tokenIds: ["colors::primary"],
			}),
		);
		expect(report.changes.filter(({ path }) => path === "/colors/primary")).toHaveLength(0);
	});
});
