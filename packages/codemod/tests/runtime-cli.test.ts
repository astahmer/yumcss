import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import {
	DEFAULT_RUNTIME_CSS_OUTPUT,
	generateRuntimeCssModule,
	parseRuntimeMethods,
	RUNTIME_CSS_GENERATED_HEADER,
} from "../src/runtime/codegen.ts";
import {
	createRuntimeCli,
	formatRuntimeExplanation,
	parseRuntimeCommand,
	RuntimeCommand,
} from "../src/runtime/cli.ts";

const cwd = "/fixture/project";

describe("yumcss-codemod runtime command", () => {
	test("parses stable method selections and safe defaults", () => {
		expect(parseRuntimeMethods()).toEqual([
			"class",
			"vars",
			"raw",
			"props",
			"group",
			"input",
			"keyframes",
		]);
		expect(parseRuntimeMethods("group, input")).toEqual(["vars", "group", "input"]);
		expect(parseRuntimeMethods("call")).toEqual([]);
		const callOnly = generateRuntimeCssModule([]);
		expect(callOnly).toContain("Pick<CssFn<TStyles>, never>");
		expect(callOnly).not.toContain("attach");
		expect(
			parseRuntimeCommand(
				[RuntimeCommand.Generate, "generated/css.ts", "--methods", "class,vars"],
				cwd,
			),
		).toEqual({
			command: RuntimeCommand.Generate,
			outFile: `${cwd}/generated/css.ts`,
			methods: ["class", "vars"],
			check: false,
			cwd,
		});
		expect(parseRuntimeCommand([], cwd)).toEqual({
			command: RuntimeCommand.Generate,
			outFile: `${cwd}/${DEFAULT_RUNTIME_CSS_OUTPUT}`,
			methods: ["class", "vars", "raw", "props", "group", "input", "keyframes"],
			check: false,
			cwd,
		});
		expect(
			parseRuntimeCommand(
				[RuntimeCommand.Explain, "src/styles.ts", "--preset", "./preset.ts#preset", "--json"],
				cwd,
			),
		).toEqual({
			command: RuntimeCommand.Explain,
			sourceFile: `${cwd}/src/styles.ts`,
			presetSpecifier: "./preset.ts#preset",
			json: true,
			cwd,
		});
	});

	test("rejects ambiguous and malformed method selections", () => {
		expect(() => parseRuntimeMethods("call,class")).toThrow(
			"'call' cannot be combined with named methods",
		);
		expect(() => parseRuntimeMethods("class,,vars")).toThrow("contains an empty method name");
		expect(() => parseRuntimeMethods("class,missing")).toThrow(
			"Unknown CSS runtime method 'missing'",
		);
		expect(() => parseRuntimeCommand(["unknown"], cwd)).toThrow(
			"yumcss-codemod runtime: unknown command 'unknown'",
		);
	});

	test("generates deterministic output and supports check mode", async () => {
		const project = mkdtempSync(join(tmpdir(), "yumcss-runtime-"));
		const output = join(project, "src/runtime.ts");
		try {
			const cli = createRuntimeCli(undefined, project);
			await expect(
				cli.run([RuntimeCommand.Generate, "missing/runtime.ts", "--check"]),
			).rejects.toThrow("generated runtime is missing");
			await cli.run([RuntimeCommand.Generate, "src/runtime.ts", "--methods", "class"]);
			const generated = readFileSync(output, "utf8");
			expect(generated).toBe(generateRuntimeCssModule(["class"]));
			expect(generated.startsWith(`${RUNTIME_CSS_GENERATED_HEADER}\n`)).toBe(true);
			expect(generated).toContain("attachClass");
			expect(generated).not.toContain("attachVars");

			await expect(
				cli.run([RuntimeCommand.Generate, "src/runtime.ts", "--methods", "class", "--check"]),
			).resolves.toBeUndefined();
			writeFileSync(output, `${generated}\n`);
			await expect(
				cli.run([RuntimeCommand.Generate, "src/runtime.ts", "--methods", "class", "--check"]),
			).rejects.toThrow("generated runtime is stale");
		} finally {
			rmSync(project, { recursive: true, force: true });
		}
	});

	test("formats a pruning explanation for humans and tools", () => {
		const explanation = {
			local: "css",
			factory: "design",
			status: "preset-projected",
			methods: ["class"],
			properties: ["$frame", "fill"],
			conditions: [],
			sliceable: true,
			presetProjected: true,
			projectedPresetBytes: 128,
			projectedTokenGroups: { colors: 1 },
		} as const;
		expect(
			formatRuntimeExplanation({ sourceFile: "src/styles.ts", explanations: [explanation] }),
		).toContain("preset-projected");
		expect(
			formatRuntimeExplanation({
				sourceFile: "src/styles.ts",
				explanations: [explanation],
				json: true,
			}),
		).toContain('"schema": "yumcss.runtime-explain/1"');
	});

	test("runs the explanation command against a source file", async () => {
		const project = mkdtempSync(join(tmpdir(), "yumcss-runtime-explain-"));
		const sourceFile = join(project, "styles.ts");
		writeFileSync(
			sourceFile,
			'import { createUnsafeCss } from "yumcss/unsafe/css";\n' +
				"const css = createUnsafeCss();\n" +
				"export const styles = css.class({ color: getColor() });\n",
		);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			await createRuntimeCli(undefined, project).run([RuntimeCommand.Explain, "styles.ts"]);
			expect(log).toHaveBeenCalledWith(expect.stringContaining("method-pruned"));
		} finally {
			log.mockRestore();
			rmSync(project, { recursive: true, force: true });
		}
	});
});
