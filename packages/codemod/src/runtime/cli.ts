#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cac, type CAC, type Command } from "cac";
import {
	DEFAULT_RUNTIME_CSS_OUTPUT,
	generateRuntimeCssModule,
	parseRuntimeMethods,
	RUNTIME_CSS_GENERATED_HEADER,
	runtimeMethodSummary,
} from "./codegen.ts";
import type { CssRuntimeMethod } from "yumcss/_runtime/css-codegen";
import type { CssPreset } from "yumcss/vite/css-extract";
import type { RuntimePruningExplanation } from "yumcss/vite/runtime-pruner";

/** Runtime-safe identity values for the Node CLI boundary. */
export const RuntimeCommand = {
	Generate: "generate",
	Explain: "explain",
} as const;

export type RuntimeCommandName = (typeof RuntimeCommand)[keyof typeof RuntimeCommand];

export interface RuntimeGenerateCommand {
	readonly command: typeof RuntimeCommand.Generate;
	readonly outFile: string;
	readonly methods: readonly CssRuntimeMethod[];
	readonly check: boolean;
	readonly cwd: string;
}

export interface RuntimeExplainCommand {
	readonly command: typeof RuntimeCommand.Explain;
	readonly sourceFile: string;
	readonly presetSpecifier?: string;
	readonly json: boolean;
	readonly cwd: string;
}

export type RuntimeCommandInvocation = RuntimeGenerateCommand | RuntimeExplainCommand;

export interface RuntimeCliHandlers {
	generate(command: RuntimeGenerateCommand): Promise<void>;
	explain(command: RuntimeExplainCommand): Promise<void>;
}

export interface RuntimeCli {
	run(argv: readonly string[]): Promise<void>;
}

type CliOptions = Readonly<Record<string, unknown>>;

const optionString = (options: CliOptions, name: string): string | undefined => {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
};

const optionBoolean = (options: CliOptions, name: string): boolean => options[name] === true;

const actionPositionals = (args: readonly unknown[]): string[] =>
	args.filter((value): value is string => typeof value === "string");

const configureGenerate = (command: Command): void => {
	command
		.option(
			"--methods <list>",
			"Attachments to include: all, call, or a comma-separated method list",
		)
		.option("--check", "Fail if the generated output is missing or stale");
};

const configureExplain = (command: Command): void => {
	command
		.option("--preset <module[#export]>", "Preset module used for metadata projection")
		.option("--json", "Emit a machine-readable explanation");
};

const generateCommand = (
	cwd: string,
	positionals: readonly string[],
	options: CliOptions,
): RuntimeGenerateCommand => {
	const methods = parseRuntimeMethods(optionString(options, "methods"));
	return {
		command: RuntimeCommand.Generate,
		outFile: resolve(cwd, positionals[0] ?? DEFAULT_RUNTIME_CSS_OUTPUT),
		methods,
		check: optionBoolean(options, "check"),
		cwd,
	};
};

const explainCommand = (
	cwd: string,
	positionals: readonly string[],
	options: CliOptions,
): RuntimeExplainCommand => {
	const sourceFile = positionals[0];
	if (sourceFile === undefined) throw new Error("runtime explain: a source file is required");
	const presetSpecifier = optionString(options, "preset");
	return {
		command: RuntimeCommand.Explain,
		sourceFile: resolve(cwd, sourceFile),
		...(presetSpecifier === undefined ? {} : { presetSpecifier }),
		json: optionBoolean(options, "json"),
		cwd,
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isCssPreset = (value: unknown): value is CssPreset =>
	isRecord(value) &&
	isRecord(value.conditions) &&
	isRecord(value.properties) &&
	isRecord(value.tokens) &&
	typeof value.strict === "boolean";

const loadPreset = async (specifier: string, cwd: string): Promise<CssPreset> => {
	const [moduleSpecifier, exportName] = specifier.split("#", 2);
	const importSpecifier =
		moduleSpecifier!.startsWith(".") || moduleSpecifier!.startsWith("/")
			? pathToFileURL(resolve(cwd, moduleSpecifier!)).href
			: moduleSpecifier!;
	const moduleNamespace: Record<string, unknown> = await import(importSpecifier);
	const candidate =
		exportName === undefined
			? (moduleNamespace.default ?? moduleNamespace.examplePreset)
			: moduleNamespace[exportName];
	if (!isCssPreset(candidate))
		throw new Error(
			`runtime explain: ${specifier} did not expose a CSS preset; use module#export for a named export`,
		);
	return candidate;
};

export const formatRuntimeExplanation = ({
	sourceFile,
	explanations,
	json = false,
}: {
	readonly sourceFile: string;
	readonly explanations: readonly RuntimePruningExplanation[];
	readonly json?: boolean;
}): string => {
	if (json)
		return JSON.stringify(
			{
				schema: "yumcss.runtime-explain/1",
				sourceFile,
				factories: explanations,
			},
			null,
			2,
		);
	if (explanations.length === 0) return `${sourceFile}: no CSS runtime factory found`;
	const lines = [sourceFile];
	for (const explanation of explanations) {
		lines.push(`  ${explanation.local} (${explanation.factory}): ${explanation.status}`);
		lines.push(
			`    methods: ${explanation.methods.length === 0 ? "callable core" : explanation.methods.join(", ")}`,
		);
		lines.push(
			`    style keys: ${explanation.properties.length === 0 ? "none" : explanation.properties.join(", ")}`,
		);
		lines.push(
			`    conditions: ${explanation.conditions.length === 0 ? "none" : explanation.conditions.join(", ")}`,
		);
		if (explanation.presetProjected) {
			const groups = Object.entries(explanation.projectedTokenGroups)
				.map(([group, count]) => `${group} (${count})`)
				.join(", ");
			lines.push(
				`    preset: projected${explanation.projectedPresetBytes === undefined ? "" : ` (${explanation.projectedPresetBytes} bytes)`}`,
			);
			lines.push(`    token groups: ${groups.length === 0 ? "none" : groups}`);
		} else {
			lines.push("    preset: not projected");
		}
	}
	return lines.join("\n");
};

const createRuntimeCliApp = (handlers: RuntimeCliHandlers, cwd: string): CAC => {
	const cli = cac("yumcss-codemod runtime");
	const generate = cli.command(
		"generate [out-file]",
		"Generate a specialized typed createCss runtime module",
	);
	configureGenerate(generate);
	generate.action((...actionArgs: Array<unknown>) => {
		const options = (actionArgs.at(-1) ?? {}) as CliOptions;
		return handlers.generate(
			generateCommand(cwd, actionPositionals(actionArgs.slice(0, -1)), options),
		);
	});
	const explain = cli.command(
		"explain <source-file>",
		"Explain CSS runtime pruning for a source module",
	);
	configureExplain(explain);
	explain.action((...actionArgs: Array<unknown>) => {
		const options = (actionArgs.at(-1) ?? {}) as CliOptions;
		return handlers.explain(
			explainCommand(cwd, actionPositionals(actionArgs.slice(0, -1)), options),
		);
	});
	return cli;
};

export function parseRuntimeCommand(
	argv: readonly string[],
	cwd = process.cwd(),
): RuntimeCommandInvocation {
	const effectiveArgv = argv.length === 0 ? [RuntimeCommand.Generate] : [...argv];
	const cli = createRuntimeCliApp({ generate: async () => {}, explain: async () => {} }, cwd);
	cli.parse(["node", "yumcss-codemod runtime", ...effectiveArgv], { run: false });
	if (cli.matchedCommand === undefined)
		throw new Error(
			`yumcss-codemod runtime: unknown command '${effectiveArgv[0] ?? ""}'. Expected generate or explain`,
		);
	cli.matchedCommand.checkUnknownOptions();
	cli.matchedCommand.checkOptionValue();
	cli.matchedCommand.checkRequiredArgs();
	cli.matchedCommand.checkUnusedArgs();
	return cli.matchedCommand.name === RuntimeCommand.Explain
		? explainCommand(cwd, cli.args, cli.options as CliOptions)
		: generateCommand(cwd, cli.args, cli.options as CliOptions);
}

const defaultHandlers: RuntimeCliHandlers = {
	async generate(command) {
		const source = generateRuntimeCssModule(command.methods);
		if (command.check) {
			if (!existsSync(command.outFile))
				throw new Error(`generated runtime is missing: ${command.outFile}`);
			const current = readFileSync(command.outFile, "utf8");
			if (current !== source)
				throw new Error(
					`generated runtime is stale: ${command.outFile}; run yumcss-codemod runtime generate to refresh it`,
				);
			console.log(`yumcss: generated runtime is up to date (${command.outFile})`);
			return;
		}

		if (existsSync(command.outFile)) {
			const current = readFileSync(command.outFile, "utf8");
			if (current !== source && !current.startsWith(`${RUNTIME_CSS_GENERATED_HEADER}\n`))
				throw new Error(
					`refusing to overwrite non-generated file ${command.outFile}; choose another --out-file`,
				);
		}
		mkdirSync(dirname(command.outFile), { recursive: true });
		writeFileSync(command.outFile, source);
		console.log(
			`yumcss: generated ${runtimeMethodSummary(command.methods)} runtime at ${command.outFile}`,
		);
	},
	async explain(command) {
		const { explainRuntimePruning } = await import("yumcss/vite/runtime-pruner");
		const preset =
			command.presetSpecifier === undefined
				? undefined
				: await loadPreset(command.presetSpecifier, command.cwd);
		const explanations = explainRuntimePruning({
			code: readFileSync(command.sourceFile, "utf8"),
			id: command.sourceFile,
			...(preset === undefined ? {} : { preset }),
		});
		console.log(
			formatRuntimeExplanation({
				sourceFile: command.sourceFile,
				explanations,
				json: command.json,
			}),
		);
	},
};

class DefaultRuntimeCli implements RuntimeCli {
	private readonly handlers: RuntimeCliHandlers;
	private readonly cwd: string;

	constructor(handlers: RuntimeCliHandlers, cwd: string) {
		this.handlers = handlers;
		this.cwd = cwd;
	}

	async run(argv: readonly string[]): Promise<void> {
		const cli = createRuntimeCliApp(this.handlers, this.cwd);
		cli.help();
		const effectiveArgv = argv.length === 0 ? [RuntimeCommand.Generate] : [...argv];
		cli.parse(["node", "yumcss-codemod runtime", ...effectiveArgv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("--help") || argv.includes("-h")) return;
			throw new Error(
				`yumcss-codemod runtime: unknown command '${argv[0] ?? ""}'. Expected generate or explain`,
			);
		}
		await cli.runMatchedCommand();
	}
}

export const createRuntimeCli = (
	handlers: RuntimeCliHandlers = defaultHandlers,
	cwd = process.cwd(),
): RuntimeCli => new DefaultRuntimeCli(handlers, cwd);
