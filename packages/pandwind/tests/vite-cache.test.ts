import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createInlineTwPluginCore } from "../src/vite/index.ts";

const generatedDirectory = resolve(import.meta.dirname, "../../../examples/example/src");
const generatedTwEntry = resolve(generatedDirectory, "tw.ts");

describe("inline Vite transform cache", () => {
	test("keeps hot modules when one-off modules fill the bounded cache", async () => {
		const plugin = createInlineTwPluginCore();
		const resolver = { resolve: async () => ({ id: generatedTwEntry }) };
		const hotModules = Array.from({ length: 100 }, (_, index) => ({
			id: `/virtual/project/hot-${index}.tsx`,
			code: `import { tw } from "./tw"; export const card${index} = tw({ display: "flex", p: "4" });`,
		}));
		const initialResults: Array<{ code: string; map: null } | null> = [];

		for (const module of hotModules) {
			const result = await plugin.transform(module.code, module.id, resolver);
			expect(result).not.toBeNull();
			initialResults.push(result);
		}

		for (let index = 0; index < 1_949; index += 1) {
			const id = `/virtual/project/one-off-${index}.ts`;
			await plugin.transform(`export const value${index} = ${index};`, id, resolver);
		}

		for (let index = hotModules.length - 1; index > 0; index -= 1) {
			const module = hotModules[index]!;
			const cached = await plugin.transform(module.code, module.id, resolver);
			expect(cached).toBe(initialResults[index]);
		}

		const evicted = hotModules[0]!;
		const recomputed = await plugin.transform(evicted.code, evicted.id, resolver);
		expect(recomputed).not.toBe(initialResults[0]);
	});
});
