/**
 * Cross-module constant propagation — end-to-end contract tests.
 *
 * Layers under test:
 * 1. `analyzeModuleExports` — exported string constants + re-export surface
 *    extraction (pure AST, fixture files on disk).
 * 2. `createCrossModuleConstResolver` — fs-backed resolution: direct files,
 *    one-level barrel re-exports (named + `export *`), circular imports,
 *    non-literal exports, missing/bare sources, mtime-keyed cache +
 *    invalidation.
 * 3. `inlineCxCalls` with `importedConstants` — folded output equals what
 *    the real runtime `createCx` returns for the same values; shadowed or
 *    written consumer bindings stay runtime; TDZ guard does not apply to
 *    imports (they are live for the whole module).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { afterAll, describe, expect, test } from "vitest";
import {
	analyzeModuleExports,
	bindingIsShadowedOrWritten,
	createCrossModuleConstResolver,
	type ModuleExportAnalysis,
} from "../src/vite/cross-module-consts.ts";
import { inlineCxCalls } from "../src/vite/cx-inline.ts";
import { pandwindVite } from "../src/vite/index.ts";
import type { ConstantScope } from "../src/vite/cx-inline.ts";
import { readGeneratedTwConfig } from "./helpers/generated-tw.ts";

const config = readGeneratedTwConfig(resolve(import.meta.dirname, "../../../examples/example/src"));
const FIXTURES = resolve(import.meta.dirname, "fixtures/cx-cross-module");

function analyzeFile(path: string): ModuleExportAnalysis {
	const code = readFileSync(path, "utf8");
	return analyzeModuleExports(parseModule(code, path) as never);
}

function parseModule(code: string, id: string) {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	return result.program;
}

/** Extract the last string literal in transformed code (the folded result). */
function lastLiteral(code: string): string {
	const matches = [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
	expect(matches.length).toBeGreaterThan(0);
	return JSON.parse(matches[matches.length - 1]![0]);
}

/** Runtime oracle: what cx would return for the same values. */
function runtime(...inputs: Array<string | false | null | undefined>): string {
	// The merge of pure strings is space-join with conflict resolution;
	// parity is asserted against a REAL createCx instance below where it
	// matters. This helper only covers the trivial all-string cases used here.
	return inputs.filter((v): v is string => typeof v === "string").join(" ");
}

describe("analyzeModuleExports", () => {
	test("extracts string constants, skips non-strings", () => {
		const analysis = analyzeFile(join(FIXTURES, "constants.ts"));
		expect(analysis.strings.get("P6")).toBe("p-6");
		expect(analysis.strings.get("BRAND_BG")).toBe("bg-indigo-600");
		expect(analysis.strings.has("NOT_A_STRING")).toBe(false);
	});

	test("records re-exports and stars for barrels", () => {
		const analysis = analyzeFile(join(FIXTURES, "barrel.ts"));
		expect(analysis.reexports.get("P6")).toEqual({ source: "./constants", orig: "P6" });
		expect(analysis.stars).toEqual(["./palette"]);
	});
});

describe("resolver", () => {
	const resolver = createCrossModuleConstResolver();

	function scopeFor(consumerSource: string, consumerId = "app.ts"): ConstantScope {
		const program = parseModule(consumerSource, consumerId);
		return resolver.importedScope(resolve(FIXTURES, consumerId), program as never);
	}

	test("direct file: binding resolves to the exported value", () => {
		const scope = scopeFor('import { P6 } from "./constants";\nexport const c = cx(P6);');
		expect(scope.get("P6")?.value).toBe("p-6");
	});

	test("barrel re-export resolves one level deep", () => {
		const scope = scopeFor(
			'import { P6, TONE } from "./barrel";\nexport const c = cx(P6, TONE);',
			"consumer.ts",
		);
		expect(scope.get("P6")?.value).toBe("p-6");
		expect(scope.get("TONE")?.value).toBe("text-white");
	});

	test("circular import chains never hang; derived values stay dynamic", () => {
		// circular-b exports B as a LITERAL -> propagates regardless of the
		// cycle elsewhere in that module (depth cap stops runaway traversal).
		const scopeB = scopeFor(
			'import { B } from "./circular-b";\nexport const c = cx(B);',
			"a-consumer.ts",
		);
		expect(scopeB.get("B")?.value).toBe("b");
		// USES_B is derived from an import inside circular-b -> not a
		// top-level string literal -> must not propagate.
		const scopeDerived = scopeFor(
			'import { USES_B } from "./circular-b";\nexport const c = cx(USES_B);',
			"a-consumer-derived.ts",
		);
		expect(scopeDerived.has("USES_B")).toBe(false);
	});

	test("non-literal exports do not propagate", () => {
		const scope = scopeFor(
			'import { NOT_A_STRING } from "./constants";\nexport const c = cx(NOT_A_STRING);',
			"n.ts",
		);
		expect(scope.has("NOT_A_STRING")).toBe(false);
	});

	test("bare package sources are skipped", () => {
		const scope = scopeFor(
			'import { something } from "some-pkg";\nexport const c = cx(something);',
		);
		expect(scope.size).toBe(0);
	});

	test("shadowing/writing in the consumer blocks propagation", () => {
		const shadowed = parseModule(
			'import { P6 } from "./constants";\nfunction Badge({ P6 }: { P6: string }) { return cx(P6); }',
			"shadow.ts",
		);
		expect(bindingIsShadowedOrWritten(shadowed as never, "P6")).toBe(true);
		const written = parseModule(
			'import { P6 } from "./constants";\nP6 = "nope";\nexport const c = cx(P6);',
			"written.ts",
		);
		expect(bindingIsShadowedOrWritten(written as never, "P6")).toBe(true);
	});

	test("invalidate() picks up changed values", () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-xmod-"));
		try {
			const constsPath = join(dir, "consts.ts");
			writeFileSync(constsPath, 'export const PAD = "p-2";');
			const consumerId = join(dir, "app.ts");
			const source = 'import { PAD } from "./consts";\nexport const c = cx(PAD);';

			const before = resolver.importedScope(consumerId, parseModule(source, consumerId) as never);
			expect(before.get("PAD")?.value).toBe("p-2");

			writeFileSync(constsPath, 'export const PAD = "p-8";');
			resolver.invalidate(constsPath);
			const after = resolver.importedScope(consumerId, parseModule(source, consumerId) as never);
			expect(after.get("PAD")?.value).toBe("p-8");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("inlineCxCalls folds through importedConstants", () => {
	const imported: ConstantScope = new Map([
		["P6", { value: "p-6", declStart: 0 }],
		["BRAND", { value: "bg-indigo-600", declStart: 0 }],
	]);

	test("folded output equals real runtime cx for the same values", async () => {
		const { createDesignCss } = await import("../src/design/index.ts");
		const { createCx } = await import("../src/cx/index.ts");
		const { examplePreset } = await import("@pandwind/example-preset");
		const dss = createDesignCss(examplePreset);
		const real = createCx({
			css: dss as never,
			conflicts: config.conflicts,
			compose: config.compose,
			directionalConflicts: config.directionalConflicts,
		});

		const cases: Array<Array<string>> = [
			["p-6", "text-sm"],
			["bg-indigo-600", "text-sm font-semibold"],
			["p-6", "px-4"],
		];
		for (const inputs of cases) {
			const expected = real(...inputs);
			const source = `const cls = cx(${inputs.map((i) => JSON.stringify(i)).join(", ")});`;
			const { code } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
			expect(lastLiteral(code)).toBe(expected);
		}

		const viaImports = 'export const cls = cx(P6, BRAND, "text-sm");';
		const { code, inlined } = inlineCxCalls(viaImports, "app.ts", config, new Set(["cx"]), {
			importedConstants: imported,
		});
		expect(inlined).toBe(1);
		expect(lastLiteral(code)).toBe(real("p-6", "bg-indigo-600", "text-sm"));
		void runtime;
	});

	test("imports fold like literals (TDZ guard does not block them)", () => {
		const source = 'export const cls = cx(P6, "text-sm");';
		const { inlined, code } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]), {
			importedConstants: imported,
		});
		expect(inlined).toBe(1);
		expect(code).not.toContain("cx(");
	});

	test("without importedConstants the same call stays runtime", () => {
		const source = 'export const cls = cx(P6, "text-sm");';
		const { inlined, code } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
		expect(inlined).toBe(0);
		expect(code).toContain("cx(P6");
	});

	test("local declarations override same-named imports", () => {
		const localScope: ConstantScope = new Map([["BRAND", { value: "bg-red-600", declStart: 0 }]]);
		const source = 'export const cls = cx(BRAND, "text-sm");';
		const { code } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]), {
			importedConstants: imported,
		});
		// Local collectModuleConstants finds no local BRAND here; the imported
		// value must be used — this test pins the merge order via the local
		// declaration case instead:
		void localScope;
		const { code: localWinsCode, inlined: localInlined } = inlineCxCalls(
			'const BRAND = "bg-emerald-600";\nexport const cls = cx(BRAND, "text-sm");',
			"app.ts",
			config,
			new Set(["cx"]),
			{ importedConstants: imported },
		);
		expect(localInlined).toBe(1);
		expect(lastLiteral(localWinsCode)).toBe(runtime("bg-emerald-600", "text-sm"));
		expect(localWinsCode).toBeDefined();
		expect(code).toBeDefined();
	});
});

afterAll(() => {
	// fixture cleanup not needed — fixtures are committed test data
	void tmpdir;
	void rmSync;
});

describe("real plugin transform: cross-module folding + HMR invalidation", () => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-xmod-vite-"));
	const exampleSrc = resolve(import.meta.dirname, "../../../examples/example/src");

	writeFileSync(
		join(dir, "constants.ts"),
		'export const PAD = "p-2";\nexport const TONE = "text-white";',
	);
	const appId = join(dir, "app.ts");
	writeFileSync(
		appId,
		[
			'import { tw } from "./tw";',
			'import { cx } from "./cx";',
			'import { PAD, TONE } from "./constants";',
			'export const cls = cx(tw({ p: "6" }), PAD, TONE);',
		].join("\n"),
	);

	const plugin = pandwindVite();
	const resolverStub = {
		resolve: async () => ({ id: join(exampleSrc, "tw.ts") }),
	};

	async function transformApp(): Promise<string | null> {
		const code = readFileSync(appId, "utf8");
		const result = await plugin.transform.call(resolverStub as never, code, appId);
		return result === null ? null : result.code;
	}

	test("first pass resolves constants and folds completely", async () => {
		const code = await transformApp();
		expect(code).not.toBeNull();
		// PAD (p-2) is also padding, so it correctly supersedes tw's p-6.
		expect(code).toContain('"p-2 text-white"');
		expect(code).not.toContain("cx(");
	});

	test("HMR invalidation picks up changed constant values", async () => {
		writeFileSync(
			join(dir, "constants.ts"),
			'export const PAD = "p-8";\nexport const TONE = "text-black";',
		);
		plugin.handleHotUpdate?.({ file: join(dir, "constants.ts") });

		const code = await transformApp();
		expect(code).not.toBeNull();
		expect(code).toContain('"p-8 text-black"');

		rmSync(dir, { recursive: true, force: true });
	});
});
