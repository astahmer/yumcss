import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples.ts";
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

function siblingBindings(def: (typeof EXAMPLES)[number]): EvalInput["moduleBindings"] {
	if (def.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < def.files.length; index++) {
		const file = def.files[index]!;
		bindings["./" + file.name] = evalSiblingModule(makeInput(file.code));
	}
	return bindings;
}

describe("example catalog evaluates end to end", () => {
	it("every entry tab produces a playground result", () => {
		for (const def of EXAMPLES) {
			const result = evalPlayground(makeInput(def.files[0]!.code, siblingBindings(def)));
			const label = def.path + " (" + def.files[0]!.name + ")";
			const outcome = result.ok ? "ok" : "error: " + result.error;
			expect(outcome, label).toBe("ok");
		}
	});

	it("every sibling tab evaluates in module mode", () => {
		for (const def of EXAMPLES) {
			for (let index = 1; index < def.files.length; index++) {
				const file = def.files[index]!;
				expect(
					() => evalSiblingModule(makeInput(file.code)),
					def.path + " sibling " + file.name,
				).not.toThrow();
			}
		}
	});
});
