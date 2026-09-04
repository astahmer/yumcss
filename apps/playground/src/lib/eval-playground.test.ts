/**
 * Playground eval engine — merge accounting, fold classification and error
 * handling, driven through the REAL tw/css/cx bindings.
 */
import { describe, expect, test } from "vitest";
import { cx } from "../cx.ts";
import { css } from "../design.ts";
import { tw } from "../tw.ts";
import { evalPlayground, type EvalInput } from "./eval-playground.ts";

const run = (code: string, props?: Record<string, unknown>): ReturnType<typeof evalPlayground> =>
	evalPlayground({
		code,
		tw: tw as EvalInput["tw"],
		css: css as unknown as EvalInput["css"],
		cx: cx as EvalInput["cx"],
		props,
	});

describe("evalPlayground", () => {
	test("simple tw() object evaluates to a class string", () => {
		const result = run(`tw({ bgColor: "red-500" })`);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.output).toContain("bg-red-500");
			expect(result.fold).toBe("full");
			expect(result.killed).toEqual([]);
		}
	});

	test("full-overlap conflicts kill the earlier token", () => {
		const result = run(`cx(tw({ bgColor: "red-500" }), "bg-blue-600")`);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.survived).toContain("bg-blue-600");
			expect(result.killed).toContain("bg-red-500");
			expect(result.output).toBe("bg-blue-600");
		}
	});

	test("partial overlap (axis refinement) keeps both — tailwind-merge semantics", () => {
		const result = run(`cx(tw({ p: "4" }), "px-8")`);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.output).toContain("p-4");
			expect(result.output).toContain("px-8");
			expect(result.killed).toEqual([]);
		}
	});

	test("props drive dynamic values (runtime fold)", () => {
		const result = run(`cx(props.tone, "flex items-center")`, { tone: "red-600" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fold).toBe("runtime");
			expect(result.output).toContain("flex");
			expect(result.output).toContain("items-center");
		}
	});

	test("multi-statement code with a const declaration works", () => {
		const result = run(
			['const base = tw({ display: "flex", gap: "4" });', 'cx(base, "p-2");'].join("\n"),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.output).toContain("flex");
			expect(result.output).toContain("gap-4");
			expect(result.output).toContain("p-2");
		}
	});

	test("dynamic conditional with static branches is a partial fold", () => {
		const result = run(`cx(props.active ? "bg-blue-600" : "bg-gray-100", "px-4")`, {
			active: false,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fold).toBe("partial");
			expect(result.tokensIn).toContain("px-4");
		}
	});

	test("props-driven values classify as runtime and still merge raw strings", () => {
		const result = run(`cx(props.tone, "flex items-center")`, { tone: "red-600" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fold).toBe("runtime");
			expect(result.output).toContain("items-center");
		}
	});

	test("empty input errors clearly", () => {
		const result = run("");
		expect(result.ok).toBe(false);
	});

	test("syntax errors come back as data, not throws", () => {
		const result = run(`tw({ broken`);
		expect(result.ok).toBe(false);
	});

	test("a real file with imports and exports evaluates after module syntax is stripped", () => {
		const result = run(
			[
				'import { tw } from "pandwind";',
				'import type { Tw } from "pandwind/tw";',
				"",
				'export const tone = "red-500" as const;',
				"",
				"export function Button() {",
				"  return null;",
				"}",
				"",
				'tw({ bgColor: tone, p: "4" });',
			].join("\n"),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.output).toContain("bg-red-500");
			expect(result.output).toContain("p-4");
			expect(result.fold).toBe("full");
		}
	});

	test("a multi-line named import is stripped whole", () => {
		const result = run(
			[
				"import {",
				"  tw,",
				'} from "pandwind";',
				"",
				'tw({ display: "flex" });',
			].join("\n"),
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.output).toContain("flex");
	});

	test("a file with imports but no expression reports the friendly error", () => {
		const result = run('import { tw } from "pandwind";\n\nconst tone = "red-500";');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("final expression");
	});
});
