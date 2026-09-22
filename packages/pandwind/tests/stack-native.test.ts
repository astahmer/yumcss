import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const svelteSource = readFileSync(new URL("../src/stack/Stack.svelte", import.meta.url), "utf8");
const astroSource = readFileSync(new URL("../src/stack/Stack.astro", import.meta.url), "utf8");

describe("native Stack component adapters", () => {
	test("Svelte uses the shared mapper, native class prop, rest attributes, and slot", () => {
		expect(svelteSource).toContain('from "pandwind/stack"');
		expect(svelteSource).toContain("export let direction");
		expect(svelteSource).toContain("$$restProps");
		expect(svelteSource).toContain("<slot />");
		expect(svelteSource).toContain("class={mergedClass}");
	});

	test("Astro uses the shared mapper, native class prop, rest attributes, and slot", () => {
		expect(astroSource).toContain('from "pandwind/stack"');
		expect(astroSource).toContain("interface Props extends StackProps");
		expect(astroSource).toContain("class: extraClass");
		expect(astroSource).toContain("...attributes");
		expect(astroSource).toContain("<slot />");
	});
});
