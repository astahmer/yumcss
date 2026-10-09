import { describe, expect, it } from "vitest";
import { analyzeTokenGovernance } from "./service.ts";
import { buildGovernancePruneChangeset } from "./prune-changeset.ts";
import type { TokenPolicySnapshot } from "./contracts.ts";

const policy: TokenPolicySnapshot = {
	owner: "yumcss",
	resolved: true,
	strictProperties: ["color"],
	origin: "preset:strict",
};

const FILES = [
	{
		file: "src/app.tsx",
		content: [
			'import { tw } from "yumcss";',
			'const a = tw({ bgColor: "$colors.brand" });',
			'const b = tw({ color: "#e11d48" });          // strict violation + suggestion',
			"const c = tw({ padding: size });               // dynamic",
		].join("\n"),
	},
];

describe("analyzeTokenGovernance", () => {
	it("composes universe, usage, suggestions, and candidates end to end", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: FILES,
			policy,
			generatedAt: "2026-01-01T00:00:00.000Z",
			tokenContext: {
				tokenGroups: { colors: { brand: "#e11d48", legacy: "#abc123" } },
			},
		});
		expect(report).toMatchInlineSnapshot(
			`
			{
			  "definitions": [
			    {
			      "group": "colors",
			      "id": "colors::brand",
			      "layer": "raw",
			      "name": "brand",
			      "provenance": [
			        {
			          "detail": "colors.brand",
			          "origin": "yumcss",
			          "source": "official-config",
			        },
			      ],
			      "value": "#e11d48",
			    },
			    {
			      "group": "colors",
			      "id": "colors::legacy",
			      "layer": "raw",
			      "name": "legacy",
			      "provenance": [
			        {
			          "detail": "colors.legacy",
			          "origin": "yumcss",
			          "source": "official-config",
			        },
			      ],
			      "value": "#abc123",
			    },
			  ],
			  "diagnostics": [],
			  "generatedAt": "2026-01-01T00:00:00.000Z",
			  "policy": {
			    "origin": "preset:strict",
			    "owner": "yumcss",
			    "resolved": true,
			    "strictProperties": [
			      "color",
			    ],
			  },
			  "root": "/repo",
			  "suggestions": [
			    {
			      "confidence": "verified",
			      "end": 104,
			      "file": "src/app.tsx",
			      "property": "color",
			      "rawValue": ""#e11d48"",
			      "reason": "exact value match for colors::brand",
			      "replacement": "$colors.brand",
			      "start": 95,
			      "tokenId": "colors::brand",
			    },
			  ],
			  "summary": {
			    "boundaries": {
			      "configuration-failure": 0,
			      "dynamic-expression": 1,
			      "generated-css": 0,
			      "plugin-output": 0,
			      "public-export": 0,
			      "runtime-theme-access": 0,
			      "safelist": 0,
			      "unresolved-import": 0,
			      "unscanned-file": 0,
			    },
			    "defined": 2,
			    "notRemovable": 0,
			    "rawAllowed": 0,
			    "reviewRequired": 1,
			    "safeToRemove": 0,
			    "strictViolations": 1,
			    "suggestions": 1,
			    "unknownStrictness": 0,
			    "unusedCandidates": 1,
			    "used": 2,
			  },
			  "unusedCandidates": [
			    {
			      "boundaries": [
			        "dynamic-expression",
			      ],
			      "reasons": [
			        "coverage boundary: dynamic-expression",
			      ],
			      "safety": "review-required",
			      "tokenId": "colors::legacy",
			    },
			  ],
			  "usage": [
			    {
			      "confidence": "verified",
			      "end": 104,
			      "file": "src/app.tsx",
			      "kind": "direct",
			      "property": "color",
			      "rawValue": ""#e11d48"",
			      "start": 95,
			      "strictness": "raw-strict-violation",
			      "tokenId": "",
			    },
			    {
			      "confidence": "verified",
			      "end": 68,
			      "file": "src/app.tsx",
			      "kind": "direct",
			      "property": "bgColor",
			      "rawValue": ""$colors.brand"",
			      "start": 53,
			      "strictness": "token",
			      "tokenId": "colors::brand",
			    },
			  ],
			  "version": 1,
			}
		`.replace('\n  "diagnosticCount": undefined\n', ""),
		);
	});

	it("keeps unresolved policy report-only", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: FILES,
			generatedAt: "2026-01-01T00:00:00.000Z",
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48" } } },
		});
		expect(report.policy).toBeNull();
		expect(report.usage.every((u) => u.strictness !== "raw-strict-violation")).toBe(true);
		expect(report.summary.strictViolations).toBe(0);
	});

	it.each([
		[
			"a named alias",
			'import { css as makeStyle } from "./css"; makeStyle({ color: "$colors.brand" });',
		],
		[
			"a namespace binding",
			'import * as styles from "./css"; styles.css({ color: "$colors.brand" });',
		],
	])("does not recommend removing tokens used through %s", (_label, content) => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [{ file: "src/app.ts", content }],
			policy,
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48" } } },
		});

		expect(report.usage).toContainEqual(expect.objectContaining({ tokenId: "colors::brand" }));
		expect(report.unusedCandidates.some((candidate) => candidate.tokenId === "colors::brand")).toBe(
			false,
		);
	});

	it("requires review before pruning tokens behind comment-adjacent dynamic values", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [
				{
					file: "src/app.tsx",
					content: 'import { css } from "yumcss"; css({ /* } */ color: dynamicColor });',
				},
			],
			policy,
			generatedAt: "2026-01-01T00:00:00.000Z",
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48" } } },
		});
		const candidate = report.unusedCandidates.find((item) => item.tokenId === "colors::brand");
		expect(candidate?.safety).toBe("review-required");
		expect(candidate?.boundaries).toContain("dynamic-expression");
	});

	it("tracks qualified token references from public object exports by group", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [
				{
					file: "src/theme.ts",
					content: 'export const theme = { color: "$colors.brand" };',
				},
			],
			tokenContext: {
				tokenGroups: {
					colors: { brand: "#e11d48" },
					semantic: { brand: "#abc123" },
				},
			},
		});
		const candidates = new Map(
			report.unusedCandidates.map((candidate) => [candidate.tokenId, candidate]),
		);

		expect(report.summary.boundaries["public-export"]).toBe(1);
		expect(candidates.get("colors::brand")).toMatchObject({
			safety: "review-required",
			boundaries: ["public-export"],
		});
		expect(candidates.get("semantic::brand")).toMatchObject({ safety: "safe-to-remove" });
	});

	it("does not miss exported token values after a brace inside a string", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [
				{
					file: "src/theme.ts",
					content: 'export const theme = { note: "}", color: "$brand" };',
				},
			],
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48" } } },
		});
		const candidate = report.unusedCandidates.find((item) => item.tokenId === "colors::brand");

		expect(report.summary.boundaries["public-export"]).toBe(1);
		expect(candidate).toMatchObject({ safety: "review-required", boundaries: ["public-export"] });
	});

	it("downgrades candidates when configuration fails", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [],
			generatedAt: "2026-01-01T00:00:00.000Z",
			tokenContext: {
				tokenGroups: { colors: { brand: "#e11d48" } },
				loaderFailures: ["loader exploded"],
			},
		});
		expect(report.unusedCandidates[0]).toMatchObject({ safety: "review-required" });
		expect(report.diagnostics.some((d) => d.boundary === "configuration-failure")).toBe(true);
	});
});

it.each([
	"color",
	"theme[name]",
	"resolveColor()",
	'active ? "$brand" : "blue"',
	'"$" + tokenName',
])("does not recommend removal with unresolved dynamic usage: %s", (expression) => {
	const report = analyzeTokenGovernance({
		root: "/repo",
		files: [
			{
				file: "src/card.tsx",
				content: `const color=active ? "$brand" : "blue"; css({color:${expression}});`,
			},
		],
		tokenContext: { tokenGroups: { colors: { brand: "red" } } },
	});
	expect(report.summary.boundaries["dynamic-expression"]).toBe(1);
	expect(report.unusedCandidates).toEqual([
		expect.objectContaining({
			tokenId: "colors::brand",
			safety: "review-required",
			boundaries: ["dynamic-expression"],
		}),
	]);
	expect(buildGovernancePruneChangeset(report)).toEqual({ count: 0, content: null });
});

it.each(["color", "...styles"])(
	"withholds token removal for shorthand and spread styles: %s",
	(properties) => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [{ file: "src/card.tsx", content: `css({${properties}});` }],
			tokenContext: { tokenGroups: { colors: { brand: "red" } } },
		});
		expect(report.summary.boundaries["dynamic-expression"]).toBe(1);
		expect(report.unusedCandidates[0]?.safety).toBe("review-required");
		expect(buildGovernancePruneChangeset(report).count).toBe(0);
	},
);

it("withholds token removal when a source file cannot be parsed", () => {
	const report = analyzeTokenGovernance({
		root: "/repo",
		files: [
			{
				file: "src/broken.tsx",
				content: 'const broken = ; css({ color: "$colors.brand" });',
			},
		],
		tokenContext: { tokenGroups: { colors: { brand: "red" } } },
	});

	expect(report.summary.boundaries["unscanned-file"]).toBe(1);
	expect(report.unusedCandidates).toEqual([
		expect.objectContaining({
			tokenId: "colors::brand",
			safety: "review-required",
			boundaries: ["unscanned-file"],
		}),
	]);
	expect(buildGovernancePruneChangeset(report)).toEqual({ count: 0, content: null });
});

it("scans every CSS object argument and marks indirect arguments as dynamic", () => {
	const report = analyzeTokenGovernance({
		root: "/repo",
		files: [
			{
				file: "src/card.tsx",
				content:
					'const style = { color: "$colors.brand" }; css(style, { backgroundColor: "$colors.accent" });',
			},
		],
		tokenContext: { tokenGroups: { colors: { brand: "red", accent: "blue" } } },
	});

	expect(report.summary.boundaries["dynamic-expression"]).toBe(1);
	expect(report.usage.map((usage) => usage.tokenId)).toContain("colors::accent");
	expect(report.unusedCandidates).toEqual([
		expect.objectContaining({
			tokenId: "colors::brand",
			safety: "review-required",
			boundaries: ["dynamic-expression"],
		}),
	]);
	expect(buildGovernancePruneChangeset(report)).toEqual({ count: 0, content: null });
});
