/**
 * Integration tests against the *generated* artifacts — the real `tw` instance
 * and safelist produced by codegen + scanner, not hand-made fixtures.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { describe, expect, test } from "vitest";
import { createTw } from "../src/tw/runtime.ts";
import { tw } from "../../../examples/example/src/tw.ts";
import { __pandwindRuntimeConfig } from "../../../examples/example/src/tw.runtime.ts";
import { collectTwClasses } from "../src/tw/collect.ts";
import { createSourceWorkspace } from "../src/source-workspace.ts";

const app = resolve(import.meta.dirname, "../../../examples/example");
const safelistEntries = (): Array<string> =>
	[
		...readFileSync(resolve(app, "src/pandwind.safelist.css"), "utf8").matchAll(
			/@source inline\("([^"]+)"\);/g,
		),
	].map((m) => m[1] ?? "");

describe("generated tw runtime", () => {
	test("composes class strings with the real variant metadata", () => {
		expect(tw({ rounded: "xl", bg: "white", p: "6", shadow: "lg" })).toBe(
			"rounded-xl bg-white p-6 shadow-lg",
		);
		expect(tw({ sm: { flex: "col" } })).toBe("sm:flex sm:flex-col");
		expect(tw({ group: { hover: { opacity: "100" } } })).toBe("group-hover:opacity-100");
		expect(tw({ "@": { md: { hover: { bg: "red-500" } } } })).toBe("@md:hover:bg-red-500");
		expect(tw({ focusVisible: { outline: ["2", "sky-600"] } })).toBe(
			"focus-visible:outline-2 focus-visible:outline-sky-600",
		);
	});

	test("merges conflicts only with an explicit generated conflict map", () => {
		const conflictTw = createTw(__pandwindRuntimeConfig);
		expect(conflictTw({ px: "4", p: "6" })).toBe("p-6");
		expect(conflictTw({ p: "6", px: "4" })).toBe("p-6 px-4");
		expect(conflictTw({ p: "6", pb: "10" })).toBe("p-6 pb-10");
		expect(conflictTw({ text: ["2xl", "gray-900", "center"] })).toBe(
			"text-2xl text-gray-900 text-center",
		);
		expect(conflictTw({ border: ["2", "red-500"] })).toBe("border-2 border-red-500");
		expect(conflictTw({ bg: ["red-500/50", "blue-500"] })).toBe("bg-blue-500");
		expect(conflictTw({ p: "4", md: { p: "6" } })).toBe("p-4 md:p-6");
	});

	test("safelist matches scanner output and every class compiles", async () => {
		const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");
		const system = await __unstable__loadDesignSystem(css, { base: resolve(app, "src") });
		const workspace = createSourceWorkspace();
		const files = workspace.files(["**/*"], resolve(app, "src"));
		const scanned = await collectTwClasses(files, resolve(app, "src/tw.ts"), workspace);
		const safelist = safelistEntries();

		expect([...scanned].toSorted()).toEqual([...safelist].toSorted());
		expect(system.candidatesToCss([...safelist]).every((out) => out !== null)).toBe(true);
	});
});
