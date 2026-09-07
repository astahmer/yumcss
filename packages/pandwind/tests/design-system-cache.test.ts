import { describe, expect, test } from "vitest";
import { createTailwindDesignSystemLoader } from "../src/tw/design-system-cache.ts";

describe("Tailwind design-system loader", () => {
	test("deduplicates concurrent loads for the same CSS graph", async () => {
		let calls = 0;
		const system = {} as never;
		const load = createTailwindDesignSystemLoader(
			async () => {
				calls++;
				await Promise.resolve();
				return system;
			},
		);

		const [first, second] = await Promise.all([
			load('@import "tailwindcss";', { base: "/project" }),
			load('@import "tailwindcss";', { base: "/project" }),
		]);

		expect(calls).toBe(1);
		expect(first).toBe(second);
	});

	test("keeps CSS graphs and project bases isolated", async () => {
		let calls = 0;
		const load = createTailwindDesignSystemLoader(async () => {
			calls++;
			return {} as never;
		});

		await load(".a { color: red; }", { base: "/project" });
		await load(".b { color: blue; }", { base: "/project" });
		await load(".a { color: red; }", { base: "/other-project" });

		expect(calls).toBe(3);
	});
});
