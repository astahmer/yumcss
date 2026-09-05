/**
 * Playground eval engine — merge accounting, fold classification and error
 * handling, driven through the REAL tw/css/cx bindings.
 */
import { describe, expect, test } from "vitest";
import { cx } from "../cx.ts";
import { css } from "../css.ts";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { examplePreset } from "pandwind/preset";
import { tw } from "../tw.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "./eval-playground.ts";

const run = (
	code: string,
	props?: Record<string, unknown>,
	moduleBindings?: EvalInput["moduleBindings"],
): ReturnType<typeof evalPlayground> =>
	evalPlayground({
		code,
		tw: tw as EvalInput["tw"],
		css: css as unknown as EvalInput["css"],
		cx: cx as EvalInput["cx"],
		props,
		moduleBindings,
		resolveCss: (style) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) out[String(prop)] = String(value);
			return out;
		},
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
			["import {", "  tw,", '} from "pandwind";', "", 'tw({ display: "flex" });'].join("\n"),
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.output).toContain("flex");
	});

	test("a file with imports but no expression reports the friendly error", () => {
		const result = run('import { tw } from "pandwind";\n\nconst tone = "red-500";');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("final expression");
	});

	test("imports resolve through moduleBindings by specifier", () => {
		const result = run(
			['import { tone } from "./brand.ts";', "", "tw({ bgColor: tone });"].join("\n"),
			undefined,
			{ "./brand.ts": { tone: "blue-600" } },
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.output).toContain("bg-blue-600");
			expect(result.fold).toBe("full");
		}
	});

	test("an unprovided sibling import errors with the tab hint", () => {
		const result = run('import { tone } from "./missing.ts";\n\ntw({ bgColor: tone });');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("no sibling tab provides");
	});

	test("namespace imports of a sibling land as the whole bindings record", () => {
		const result = run(
			['import * as brand from "./brand.ts";', "", "tw({ bgColor: brand.tone });"].join("\n"),
			undefined,
			{ "./brand.ts": { tone: "emerald-500" } },
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.output).toContain("bg-emerald-500");
	});

	test("css() literal records resolved declarations per atom", () => {
		const result = run('css({ $frame: { fill: "red-500", padding: "4" } });');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.atomDeclarations.length).toBeGreaterThan(0);
			expect(Object.values(result.atomDeclarations[0]?.decls ?? {})).toContain("red-500");
		}
	});

	test("css.vars() produces a class + custom-property style pair", () => {
		const result = run('css.vars({ backgroundColor: "red-500" });');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.varsOutput?.class).toContain("pw-background-color");
			expect(result.varsOutput?.style["--pw-c-background-color"]).toBe("red-500");
		}
	});

	test("css.props() resolves host props with className and style", () => {
		const result = run('css.props({ backgroundColor: "red-500", padding: "4" });');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(typeof result.propsOutput?.className).toBe("string");
			expect(result.propsOutput?.className).not.toBe("");
		}
	});
});

describe("evalSiblingModule", () => {
	test("returns every exported binding from a sibling tab", () => {
		const exports = evalSiblingModule({
			code: ['export const tone = "red-500" as const;', 'export const label = "brand";'].join("\n"),
			tw: tw as EvalInput["tw"],
			css: css as unknown as EvalInput["css"],
			cx: cx as EvalInput["cx"],
		});
		expect(exports).toEqual({ tone: "red-500", label: "brand" });
	});

	test("a sibling without exports returns an empty record", () => {
		const exports = evalSiblingModule({
			code: 'const internal = "not exported";',
			tw: tw as EvalInput["tw"],
			css: css as unknown as EvalInput["css"],
			cx: cx as EvalInput["cx"],
		});
		expect(exports).toEqual({});
	});
});
