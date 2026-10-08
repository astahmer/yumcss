import { describe, expect, it } from "vitest";
import {
	PreviewExecution,
	PreviewEngineRegistry,
	PREVIEW_ENGINE_SCHEMA,
} from "./preview-engine.ts";
import { CLASS_NAME_ADAPTERS } from "./class-name-adapters.ts";
import { evalPlayground, type PlaygroundResult } from "./eval-playground.ts";
import { SANDBOX_MODULES } from "./sandbox-modules.ts";
import { dss } from "../css.ts";
import { tw } from "../tw.ts";
import { cx } from "../cx.ts";

const source = `import { createCss } from "yumcss/css";
import { examplePreset } from "@yumcss/example-preset";
const css = createCss(examplePreset);
export default <button className={css.class({ backgroundColor: "$blue-500", padding: 16, _hover: { backgroundColor: "$red-500" } })}>Continue</button>;`;

describe("actual preview engines", () => {
	it.each(CLASS_NAME_ADAPTERS)(
		"$label compiles its actual runtime classes and hover CSS",
		async (adapter) => {
			const session = await adapter.engine.createSession(new AbortController().signal);
			const result = evalPlayground({
				code: source,
				tw,
				css: dss,
				cx,
				moduleBindings: SANDBOX_MODULES,
				classNameStrategy: session.strategy,
			});
			expect(result.ok, result.ok ? undefined : result.error).toBe(true);
			if (!result.ok) return;
			const output = await session.compile(result);
			expect(output.css).toContain(":hover");
			expect(output.css).toMatch(/padding:\s*16px/u);
			expect(output.css).toMatch(/#3182ce|--color-blue-500/u);
			expect(result.rendered).toMatchObject({ props: { className: result.output } });
			expect(result.runtimeStyle).toBeUndefined();
			expect(output.engine).not.toBe("");
		},
	);

	it.each(CLASS_NAME_ADAPTERS)(
		"$label retains actual YumCSS vars() companion rules",
		async (adapter) => {
			const session = await adapter.engine.createSession(new AbortController().signal);
			const code = `import { createCss } from "yumcss/css";
import { examplePreset } from "@yumcss/example-preset";
const css = createCss(examplePreset);
const vars = css.vars({ backgroundColor: "$blue-500" });
export default <button className={vars.class} style={vars.style}>Continue</button>;`;
			const result = evalPlayground({
				code,
				tw,
				css: dss,
				cx,
				moduleBindings: SANDBOX_MODULES,
				classNameStrategy: session.strategy,
			});
			expect(result.ok, result.ok ? undefined : result.error).toBe(true);
			if (!result.ok) return;
			expect(result.sheets.flatMap((sheet) => sheet.rules)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ css: expect.stringContaining("var(--pw-c-background-color)") }),
				]),
			);
			await expect(session.compile(result)).resolves.toHaveProperty("engine");
		},
	);

	it("allows a minimal engine without editing orchestration", async () => {
		const registry = new PreviewEngineRegistry([]);
		registry.register({
			schema: PREVIEW_ENGINE_SCHEMA,
			id: PreviewEngineRegistry.customId("fixture"),
			async createSession() {
				return {
					strategy: null,
					async compile() {
						return { css: ".fixture{color:red}", engine: "fixture", version: "1" };
					},
				};
			},
		});
		const session = await registry.resolve("fixture").createSession(new AbortController().signal);
		expect(session.strategy).toBeNull();
		expect(() => registry.resolve("missing")).toThrow("Unknown preview engine");
	});

	it("publishes compiler errors instead of retaining a styled preview", async () => {
		const published: PlaygroundResult[] = [];
		const execution = new PreviewExecution();
		await execution.run(
			async () => {
				throw new Error("native compiler rejected the input");
			},
			(result) => published.push(result),
		);
		expect(published).toEqual([{ ok: false, error: "native compiler rejected the input" }]);
	});

	it("cancels replacement work and discards stale completions", async () => {
		const published: PlaygroundResult[] = [];
		const execution = new PreviewExecution();
		let resolveOld: (value: PlaygroundResult) => void = () => {
			throw new Error("Old work did not start");
		};
		let oldSignal: AbortSignal | undefined;
		const oldWork = execution.run(
			(signal) => {
				oldSignal = signal;
				return new Promise((resolve) => {
					resolveOld = resolve;
				});
			},
			(result) => published.push(result),
		);
		await execution.run(
			async () => ({ ok: false, error: "new result" }),
			(result) => published.push(result),
		);
		expect(oldSignal?.aborted).toBe(true);
		resolveOld({ ok: false, error: "stale result" });
		await oldWork;
		expect(published).toEqual([{ ok: false, error: "new result" }]);
	});
});
