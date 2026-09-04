import { describe, expect, it } from "vitest";
import { analyzeTokenGovernance } from "./service.ts";
import type { TokenPolicySnapshot } from "./contracts.ts";

const policy: TokenPolicySnapshot = {
	owner: "pandwind",
	resolved: true,
	strictProperties: ["color"],
	origin: "preset:strict",
};

const FILES = [
	{
		file: "src/app.tsx",
		content: [
			'import { tw } from "pandwind";',
			"const a = tw({ bgColor: \"$colors.brand\" });",
			"const b = tw({ color: \"#e11d48\" });          // strict violation + suggestion",
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
			          "origin": "pandwind",
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
			          "origin": "pandwind",
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
			    "owner": "pandwind",
			    "resolved": true,
			    "strictProperties": [
			      "color",
			    ],
			  },
			  "root": "/repo",
			  "suggestions": [
			    {
			      "confidence": "verified",
			      "end": 106,
			      "file": "src/app.tsx",
			      "property": "color",
			      "rawValue": ""#e11d48"",
			      "reason": "exact value match for colors::brand",
			      "replacement": "$colors.brand",
			      "start": 97,
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
			    "reviewRequired": 0,
			    "safeToRemove": 1,
			    "strictViolations": 1,
			    "suggestions": 1,
			    "unknownStrictness": 0,
			    "unusedCandidates": 1,
			    "used": 2,
			  },
			  "unusedCandidates": [
			    {
			      "boundaries": [],
			      "reasons": [],
			      "safety": "safe-to-remove",
			      "tokenId": "colors::legacy",
			    },
			  ],
			  "usage": [
			    {
			      "confidence": "verified",
			      "end": 106,
			      "file": "src/app.tsx",
			      "kind": "direct",
			      "property": "color",
			      "rawValue": ""#e11d48"",
			      "start": 97,
			      "strictness": "raw-strict-violation",
			      "tokenId": "",
			    },
			    {
			      "confidence": "verified",
			      "end": 70,
			      "file": "src/app.tsx",
			      "kind": "direct",
			      "property": "bgColor",
			      "rawValue": ""$colors.brand"",
			      "start": 55,
			      "strictness": "token",
			      "tokenId": "colors::brand",
			    },
			  ],
			  "version": 1,
			}
		`.replace("\n  \"diagnosticCount\": undefined\n", ""),
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
