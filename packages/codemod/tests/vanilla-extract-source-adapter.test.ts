import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

describe("Vanilla Extract source adapter", () => {
	test("lowers documented styleVariants into a reusable Pandwind class map", () => {
		const source = [
			'import { styleVariants } from "@vanilla-extract/css";',
			'export const tone = styleVariants({ regular: { color: "red" }, quiet: { color: "gray" } });',
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.VanillaExtract,
			to: CodemodAdapterId.Pandwind,
			file: "tone.css.ts",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"regular": css.class({ color: "red" })');
		expect(result.code).toContain('"quiet": css.class({ color: "gray" })');
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const tone = { "regular": css.class({ color: "red" }), "quiet": css.class({ color: "gray" }) };",
			  "converted": 1,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [
			          "runtime-class",
			        ],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [],
			            "kind": "style",
			            "order": 0,
			            "source": {
			              "adapter": "vanilla-extract",
			              "end": 144,
			              "file": "tone.css.ts",
			              "pattern": "styleVariants",
			              "start": 74,
			            },
			          },
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": "regular",
			            "order": 1,
			            "source": {
			              "adapter": "vanilla-extract",
			              "end": 115,
			              "file": "tone.css.ts",
			              "pattern": "styleVariants",
			              "start": 99,
			            },
			          },
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "gray",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": "quiet",
			            "order": 2,
			            "source": {
			              "adapter": "vanilla-extract",
			              "end": 141,
			              "file": "tone.css.ts",
			              "pattern": "styleVariants",
			              "start": 124,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "vanilla-extract",
			          "end": 144,
			          "file": "tone.css.ts",
			          "pattern": "styleVariants",
			          "start": 74,
			        },
			        "sourceMap": [
			          {
			            "adapter": "vanilla-extract",
			            "end": 144,
			            "file": "tone.css.ts",
			            "pattern": "styleVariants",
			            "start": 74,
			          },
			          {
			            "adapter": "vanilla-extract",
			            "end": 115,
			            "file": "tone.css.ts",
			            "pattern": "styleVariants",
			            "start": 99,
			          },
			          {
			            "adapter": "vanilla-extract",
			            "end": 141,
			            "file": "tone.css.ts",
			            "pattern": "styleVariants",
			            "start": 124,
			          },
			        ],
			        "themes": [],
			      },
			      "representation": "named-map",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "target-native",
			      "representation": "named-map",
			      "sourceStart": 74,
			      "sourceText": "styleVariants({ regular: { color: "red" }, quiet: { color: "gray" } })",
			    },
			  ],
			  "reports": [
			    {
			      "adapter": "pandwind",
			      "blockers": [],
			      "convertible": true,
			      "exact": [
			        {
			          "blocking": false,
			          "capability": "declarations",
			          "detail": "style declarations",
			          "level": "exact",
			        },
			        {
			          "blocking": false,
			          "capability": "named-rules",
			          "detail": "named style rule: regular",
			          "level": "exact",
			        },
			      ],
			      "mode": "safe",
			      "partial": [],
			      "requirements": [
			        {
			          "capability": "declarations",
			          "detail": "style declarations",
			        },
			        {
			          "capability": "named-rules",
			          "detail": "named style rule: regular",
			        },
			      ],
			      "unsupported": [],
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": "&{color:red}&{color:gray}",
			      "canonicalTarget": "&{color:red}&{color:gray}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("keeps theme contracts explicit when a project wrapper is not statically resolved", () => {
		const source = [
			'import { createThemeContract, style } from "@vanilla-extract/css";',
			"export const contract = createThemeContract({ colors: { brand: null } });",
			"export const card = style({ color: contract.colors.brand });",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.VanillaExtract,
			to: CodemodAdapterId.Pandwind,
			file: "theme.css.ts",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "configuration" })]),
		);
		expect(result.code).toContain("createThemeContract");
	});
});
