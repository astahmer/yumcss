/**
 * Integration tests against the *generated* artifacts — the real `tw` instance
 * and safelist produced by codegen + scanner, not hand-made fixtures.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { describe, expect, test } from "vitest";
import { pandwindSafelist } from "../../../apps/example/src/pandwind.safelist.ts";
import { tw } from "../../../apps/example/src/tw.ts";
import { collectTwClasses } from "../src/tw/collect.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");

describe("generated tw runtime", () => {
	test("composes class strings with the real variant metadata", () => {
		expect(tw({ rounded: "xl", bg: "white", p: "6", shadow: "lg" })).toBe(
			"rounded-xl bg-white p-6 shadow-lg",
		);
		expect(tw({ sm: { flex: "col" } })).toBe("sm:flex sm:flex-col");
		expect(tw({ group: { hover: { opacity: "100" } } })).toBe(
			"group-hover:opacity-100",
		);
		expect(tw({ "@": { md: { hover: { bg: "red-500" } } } })).toBe(
			"@md:hover:bg-red-500",
		);
		expect(tw({ focusVisible: { outline: ["2", "sky-600"] } })).toBe(
			"focus-visible:outline-2 focus-visible:outline-sky-600",
		);
	});

	test("safelist matches scanner output and every class compiles", async () => {
		const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");
		const system = await __unstable__loadDesignSystem(css, { base: app });
		const scanned = await collectTwClasses(
			[resolve(app, "src/css-in-js-app.tsx")],
			resolve(app, "src/tw.ts"),
		);

		expect([...scanned].sort()).toEqual([...pandwindSafelist].sort());
		expect(
			system
				.candidatesToCss([...pandwindSafelist])
				.every((out) => out !== null),
		).toBe(true);
	});
});
