/**
 * Registered migration contract fixtures.
 *
 * These cases keep the useful safety coverage from the original codemod
 * suite, but exercise the adapter registry and StyleProgram route directly.
 * The removed mode switch had no project-aware configuration or target
 * capability negotiation, so it is not a supported migration path anymore.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { loadMetaFromSources } from "../src/meta.ts";
import { mapToken } from "../src/map.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	runAdapterMigration,
	SwapSourceId,
} from "../src/swap/index.ts";

const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});
const registry = createStyleAdapterRegistry([
	createTailwindAdapter({ moduleLoader: null }),
	createPandwindAdapter({ moduleLoader: null }),
]);

function migrate(
	source: string,
	to: `${CodemodAdapterId.Pandwind}:${SwapSourceId.Tw | SwapSourceId.Css}` = `${CodemodAdapterId.Pandwind}:${SwapSourceId.Tw}`,
) {
	return runAdapterMigration(source, {
		from: CodemodAdapterId.Tailwind,
		to,
		file: "test.tsx",
		meta,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});
}

describe("Tailwind -> registered Pandwind tw()", () => {
	test("plain and multiple utilities become one typed tw object", () => {
		const result = migrate('<div className="flex bg-blue-500 text-white" />');
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={tw({");
		expect(result.code).toContain("flex: true");
		expect(result.code).toContain('bgColor: "blue-500"');
		expect(result.code).toContain('textColor: "white"');
	});

	test("variants become nested objects with generated key names", () => {
		const result = migrate('<div className="hover:bg-red-500 md:bg-blue-500" />');
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"hover":');
		expect(result.code).toContain('"md":');
		expect(result.code).toContain('bgColor: "red-500"');
	});

	test("overloaded utilities use their property-aware keys", () => {
		expect(migrate('<div className="text-gray-900" />').code).toContain("textColor");
		expect(migrate('<div className="text-lg" />').code).toContain("textSize");
		expect(migrate('<div className="text-center" />').code).toContain("textAlign");
		expect(migrate('<div className="bg-gradient-to-r" />').code).toContain("bgImage");
	});

	test("unknown, arbitrary, negative, and important utilities stay visible", () => {
		const result = migrate('<div className="totally-not-a-utility w-[37px] -mt-2 !p-4" />');
		expect(result.changed).toBe(true);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.length).toBeGreaterThan(0);
		expect(result.code).toContain("totally-not-a-utility");
		expect(result.code).toContain("w-[37px]");
		expect(result.code).toContain("-mt-2");
		expect(result.code).toContain("!p-4");
	});

	test("partially typed class lists keep residual utilities in the class carrier", () => {
		const result = migrate('<div className="flex project-specific-utility" />');

		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain("cx(tw({ flex: true })");
		expect(result.code).toContain('"project-specific-utility"');
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: "project-specific-utility", preserved: true }),
			]),
		);
	});

	test("does not rewrite JSX-like text in strings or comments", () => {
		const source = [
			`const example = 'className="p-4"';`,
			`// <div className="p-6" />`,
			`/* <div className="p-8" /> */`,
			`export const A = () => <div className="bg-blue-500" />;`,
		].join("\n");
		const result = migrate(source);
		expect(result.converted).toBe(1);
		expect(result.code).toContain(`const example = 'className="p-4"';`);
		expect(result.code).toContain(`// <div className="p-6" />`);
		expect(result.code).toContain(`/* <div className="p-8" /> */`);
		expect(result.code).toContain("className={tw(");
	});

	test("is idempotent after a registered route", () => {
		const first = migrate('<div className="flex bg-blue-500 hover:bg-red-500" />');
		const second = migrate(first.code);
		expect(first.changed).toBe(true);
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);
		expect(second.code).toBe(first.code);
	});
});

describe("Tailwind -> registered Pandwind css.class()", () => {
	test("bridge-mappable values become exact resolved declarations", () => {
		const result = migrate(
			'<div className="bg-blue-500 rounded-base" />',
			`${CodemodAdapterId.Pandwind}:${SwapSourceId.Css}`,
		);
		expect(result.changed).toBe(true);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.class(");
		expect(result.code).toContain('backgroundColor: "#3182ce"');
		expect(result.code).toContain("borderRadius");
	});

	test("values outside the generated bridge remain residuals", () => {
		const result = migrate(
			'<div className="bg-blue-500 bg-not-in-this-project" />',
			`${CodemodAdapterId.Pandwind}:${SwapSourceId.Css}`,
		);
		expect(result.code).toContain("bg-not-in-this-project");
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: expect.stringContaining("bg-not-in-this-project") }),
			]),
		);
	});
});

describe("source mapping primitives", () => {
	test("negative utilities stay verbatim because their sign changes semantics", () => {
		expect(mapToken("-mt-2", meta)).toBeNull();
	});

	test("boolean utilities emit true", () => {
		const mapped = mapToken("flex", meta);
		expect(mapped).not.toBeNull();
		expect(mapped!.value).toBe(true);
		expect(mapped!.key).toBe("flex");
	});

	test("unsupported data conditions stay verbatim", () => {
		expect(mapToken("not-in-data-dragging:animate-ping", meta)).toBeNull();
		expect(mapToken("data-focus:outline-none", meta)).toBeNull();
	});
});
