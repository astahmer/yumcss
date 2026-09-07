/**
 * Token reference DAG (plans/020 adopt #1): nodes across the three tiers,
 * edges from consumer to dependency, cycle/orphan/reachability computations.
 * The graph must agree with the bridge's skip-loudly behavior on cycles.
 */
import { describe, expect, test } from "vitest";
import { buildTokenGraph } from "../src/tw/token-graph.ts";
import type { ThemeVar } from "../src/tw/generate-theme.ts";

const vars = (names: Array<[string, string]>): Array<ThemeVar> =>
	names.map(([name, value]) => ({ name, value }));

describe("buildTokenGraph", () => {
	test("raw tier: unreferenced vars are orphans", () => {
		const g = buildTokenGraph({ flatVars: vars([["--color-red-100", "#fff1f1"]]) });
		expect(g.nodes.map((n) => n.id)).toEqual(["--color-red-100"]);
		expect(g.orphans).toEqual(["--color-red-100"]);
		expect(g.cycles).toEqual([]);
	});

	test("component $ref marks the target semantic and links reachability", () => {
		const g = buildTokenGraph({
			flatVars: vars([
				["--color-brand", "#0055ff"],
				["--color-red-100", "#fff1f1"],
			]),
			components: { button: { primary: "$color-brand" } },
		});
		const comp = g.nodes.find((n) => n.id === "component:button.color-primary");
		expect(comp?.tier).toBe("component");
		// brand is referenced -> semantic; red-100 untouched -> orphan
		expect(g.nodes.find((n) => n.id === "--color-brand")?.tier).toBe("semantic");
		expect(g.orphans).toEqual(["--color-red-100"]);
		expect(g.edges).toContainEqual({ from: "component:button.color-primary", to: "--color-brand" });
		// the override target (--color-primary) is also a dependency
		expect(g.edges).toContainEqual({
			from: "component:button.color-primary",
			to: "--color-primary",
		});
		expect(g.reachability["component:button.color-primary"]).toEqual([
			"--color-brand",
			"--color-primary",
		]);
	});

	test("dotted component keys map to their own custom property", () => {
		const g = buildTokenGraph({
			flatVars: vars([["--text-muted", "#888"]]),
			components: { card: { "text.muted": "$text-muted" } },
		});
		expect(g.edges).toContainEqual({
			from: "component:card.text-muted",
			to: "--text-muted",
		});
	});

	test("self-cycle detected (agrees with buildComponentScopes skip-loudly)", () => {
		const g = buildTokenGraph({
			flatVars: vars([["--color-primary", "#000"]]),
			// verbatim key + $ref of the same name = the component re-binds
			// exactly the var it references -> emission skips it loudly
			components: { button: { "--color-primary": "$color-primary" } },
		});
		expect(g.cycles).toEqual([["--color-primary", "--color-primary"]]);
	});

	test("longer var-to-var cycles are detected through inline var() refs", () => {
		const g = buildTokenGraph({
			flatVars: vars([
				["--x", "var(--y)"],
				["--y", "var(--x)"],
			]),
		});
		expect(g.cycles.length).toBeGreaterThanOrEqual(1);
		const flattened = g.cycles.flat().toSorted();
		expect(flattened).toContain("--x");
		expect(flattened).toContain("--y");
	});

	test("unknown $refs land in dangling instead of edges", () => {
		const g = buildTokenGraph({
			flatVars: vars([["--color-red-100", "#fff1f1"]]),
			components: { card: { bg: "$nonexistent" } },
		});
		expect(g.dangling).toEqual(["--nonexistent"]);
		expect(g.edges.filter((e) => e.to === "--nonexistent")).toEqual([]);
	});

	test("theme scopes link their bindings to the re-bound variable", () => {
		const g = buildTokenGraph({
			flatVars: vars([["--color-surface", "#fff"]]),
			themes: { dark: { "--color-surface": "#0b0b10" } },
		});
		expect(g.nodes.some((n) => n.id === "theme:dark:--color-surface")).toBe(true);
		expect(g.edges).toContainEqual({
			from: "theme:dark:--color-surface",
			to: "--color-surface",
		});
		// the binding depends on the var, so the var is no longer an orphan
		expect(g.orphans).toEqual([]);
	});

	test("reachability follows chains through intermediate vars", () => {
		const g = buildTokenGraph({
			flatVars: vars([
				["--color-primary", "var(--color-brand)"],
				["--color-brand", "#0055ff"],
				["--color-unrelated", "#111"],
			]),
			components: { button: { primary: "$color-primary" } },
		});
		expect(g.reachability["component:button.color-primary"]).toEqual([
			"--color-brand",
			"--color-primary",
		]);
		expect(g.reachability["component:button.color-primary"]).not.toContain("--color-unrelated");
	});

	test("deterministic output across runs", () => {
		const input = {
			flatVars: vars([
				["--b", "var(--a)"],
				["--a", "#fff"],
			]),
			components: { z: { bg: "$b" }, a: { bg: "$a" } },
		};
		expect(JSON.stringify(buildTokenGraph(input))).toBe(JSON.stringify(buildTokenGraph(input)));
	});
});
