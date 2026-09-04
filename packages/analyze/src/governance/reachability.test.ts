import { describe, expect, it } from "vitest";
import { classifyReachability } from "./reachability.ts";
import type { TokenDefinition, TokenUsage } from "./contracts.ts";

const def = (id: string, group: string, name: string, value?: string): TokenDefinition => ({
	id,
	group,
	name,
	layer: "raw",
	...(value === undefined ? {} : { value }),
	provenance: [{ source: "official-config" }],
});

const use = (tokenId: string): TokenUsage => ({
	tokenId,
	kind: "direct",
	file: "a.tsx",
	start: 0,
	end: 10,
	strictness: "token",
	confidence: "verified",
});

describe("classifyReachability", () => {
	it("marks proven zero-use tokens as safe-to-remove", () => {
		const { candidates } = classifyReachability({
			definitions: [def("colors::brand", "colors", "brand", "#e11d48"), def("colors::dead", "colors", "dead", "#000")],
			usage: [use("colors::brand")],
		});
		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({ tokenId: "colors::dead", safety: "safe-to-remove", boundaries: [] });
	});

	it("downgrades boundary-hit tokens to review-required", () => {
		const { candidates } = classifyReachability({
			definitions: [def("colors::dyn", "colors", "dyn", "#111")],
			usage: [],
			boundaryHits: { "public-export": ["colors::dyn"], "dynamic-expression": ["colors::dyn"] },
		});
		expect(candidates[0]).toMatchObject({ safety: "review-required" });
		expect(candidates[0]!.boundaries.toSorted()).toEqual(["dynamic-expression", "public-export"]);
	});

	it("keeps css vars and interop-defined tokens out of safe removal", () => {
		const cssVar: TokenDefinition = {
			id: "css-var::--color-brand",
			group: "css-var",
			name: "--color-brand",
			layer: "raw",
			value: "#e11d48",
			provenance: [{ source: "interop-artifact" }],
		};
		const { candidates } = classifyReachability({ definitions: [cssVar], usage: [] });
		expect(candidates[0]!.safety).toBe("review-required");
		expect(candidates[0]!.reasons.length).toBeGreaterThan(0);
	});

	it("withholds safe removal when configuration is incomplete", () => {
		const { candidates, diagnostics } = classifyReachability({
			definitions: [def("colors::dead", "colors", "dead", "#000")],
			usage: [],
			configurationIncomplete: true,
		});
		expect(candidates[0]!.safety).toBe("review-required");
		expect(diagnostics[0]).toMatchObject({ code: "governance/config-incomplete", boundary: "configuration-failure" });
	});
});
