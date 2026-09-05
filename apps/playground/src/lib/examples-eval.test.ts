import { describe, expect, it } from "vitest";
import { EXAMPLES, PlaygroundApi } from "./examples.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "./eval-playground.ts";
import { tw } from "../tw.ts";
import { css as designCss } from "../css.ts";
import { cx } from "../cx.ts";
import { createCss } from "pandwind/css";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { examplePreset } from "pandwind/preset";
import { SANDBOX_MODULES } from "./sandbox-modules.ts";

function makeInput(code: string, moduleBindings?: EvalInput["moduleBindings"]): EvalInput {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: designCss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createCss as unknown as (...args: Array<unknown>) => unknown,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		props: { active: true, tone: "red-600" },
		resolveCss: (style: Record<string, unknown>) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) out[String(prop)] = String(value);
			return out;
		},
	};
}

function siblingBindings(
	variant: (typeof EXAMPLES)[number]["variants"][number],
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file = variant.files[index]!;
		bindings["./" + file.name] = evalSiblingModule(makeInput(file.code));
	}
	return bindings;
}

describe("example catalog evaluates end to end", () => {
	it("groups the own APIs under one conceptual Basics scenario", () => {
		const basics = EXAMPLES.find((example) => example.path === "/basics");

		expect(basics?.variants.map((variant) => variant.api)).toEqual([
			PlaygroundApi.Tw,
			PlaygroundApi.Css,
			PlaygroundApi.Dss,
		]);
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-tw");
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-css");
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-dss");
	});

	it("every entry tab produces a playground result", () => {
		for (const def of EXAMPLES) {
			for (const variant of def.variants) {
				const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
				const label = def.path + " / " + variant.api + " (" + variant.files[0]!.name + ")";
				const outcome = result.ok ? "ok" : "error: " + result.error;
				expect(outcome, label).toBe("ok");
			}
		}
	});

	it("every sibling tab evaluates in module mode", () => {
		for (const def of EXAMPLES) {
			for (const variant of def.variants) {
				for (let index = 1; index < variant.files.length; index++) {
					const file = variant.files[index]!;
					expect(
						() => evalSiblingModule(makeInput(file.code)),
						def.path + " / " + variant.api + " sibling " + file.name,
					).not.toThrow();
				}
			}
		}
	});
});
