import { describe, expect, it } from "vitest";
import { buildEffectiveTokenContext } from "./effective-token-context.ts";

describe("buildEffectiveTokenContext", () => {
	it("maps authored string tokens to raw definitions with provenance", () => {
		const ctx = buildEffectiveTokenContext({
			tokenGroups: { colors: { brand: "#e11d48", muted: "#94a3b8" }, spacing: { card: "16px" } },
		});
		expect(ctx.definitions.map((d) => d.id)).toEqual([
			"colors::brand",
			"colors::muted",
			"spacing::card",
		]);
		expect(ctx.definitions[0]).toMatchObject({
			layer: "raw",
			value: "#e11d48",
			provenance: [{ source: "official-config", origin: "pandwind", detail: "colors.brand" }],
		});
	});

	it("keeps condition-bound tokens scoped instead of flattening theme keys", () => {
		const ctx = buildEffectiveTokenContext({
			tokenGroups: {
				semantic: { surface: { light: "#ffffff", dark: "#0b0f19" } },
			},
		});
		const def = ctx.definitions[0]!;
		expect(def.layer).toBe("scope");
		expect(def.value).toBeUndefined();
		expect(def.scopedValues).toEqual({ dark: "#0b0f19", light: "#ffffff" });
		expect(def.themes).toEqual(["dark", "light"]);
	});

	it("merges css theme vars, scopes, and interop variables by canonical id", () => {
		const ctx = buildEffectiveTokenContext({
			themeVars: [
				{ name: "--color-brand", value: "#e11d48" },
				{ name: "--color-surface", value: "#fff" },
				{ name: "--color-surface", value: "#0b0f19", scope: '[data-theme="dark"]' },
			],
			interopVariables: { "--color-brand": "#e11d48" },
		});
		const surface = ctx.definitions.find((d) => d.name === "--color-surface")!;
		expect(surface.value).toBe("#fff");
		expect(surface.scopedValues).toEqual({ '[data-theme="dark"]': "#0b0f19" });
		const brand = ctx.definitions.find((d) => d.name === "--color-brand")!;
		expect(brand.provenance.map((p) => p.source).toSorted()).toEqual([
			"imported-css",
			"interop-artifact",
		]);
	});

	it("records loader failures and unresolved imports as boundary diagnostics", () => {
		const ctx = buildEffectiveTokenContext({
			loaderFailures: ["panda loader crashed"],
			unresolvedImports: [{ from: "src/styles.css", specifier: "missing/tokens.css" }],
		});
		expect(ctx.definitions).toEqual([]);
		expect(ctx.diagnostics).toEqual([
			{
				severity: "warning",
				code: "governance/config-load-failed",
				message: "panda loader crashed",
				boundary: "configuration-failure",
			},
			{
				severity: "warning",
				code: "governance/unresolved-import",
				message: 'unresolved css import "missing/tokens.css" from src/styles.css',
				file: "src/styles.css",
				boundary: "unresolved-import",
			},
		]);
	});

	it("keeps non-scalar token values as definitions with unknown resolved value", () => {
		const ctx = buildEffectiveTokenContext({
			tokenGroups: { shadows: { card: ["0 1px 2px rgba(0,0,0,.2)"] } },
		});
		expect(ctx.definitions[0]).toMatchObject({
			id: "shadows::card",
			layer: "raw",
		});
		expect(ctx.definitions[0]!.value).toBeUndefined();
	});
});
