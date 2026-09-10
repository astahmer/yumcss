#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cac, type CAC, type Command } from "cac";
import {
	DEFAULT_RUNTIME_CSS_OUTPUT,
	generateRuntimeCssModule,
	parseRuntimeMethods,
	RUNTIME_CSS_GENERATED_HEADER,
	runtimeMethodSummary,
} from "./codegen.ts";
import type { CssRuntimeMethod } from "pandwind/_runtime/css-codegen";

/** Runtime-safe identity values for the Node CLI boundary. */
export const RuntimeCommand = {
	Generate: "generate",
} as const;

export type RuntimeCommandName = (typeof RuntimeCommand)[keyof typeof RuntimeCommand];

export interface RuntimeGenerateCommand {
	readonly command: typeof RuntimeCommand.Generate;
	readonly outFile: string;
	readonly methods: readonly CssRuntimeMethod[];
	readonly check: boolean;
	readonly cwd: string;
}

export type RuntimeCommandInvocation = RuntimeGenerateCommand;

export interface RuntimeCliHandlers {
	generate(command: RuntimeGenerateCommand): Promise<void>;
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

const createRuntimeCliApp = (handlers: RuntimeCliHandlers, cwd: string): CAC => {
	const cli = cac("pandwind-codemod runtime");
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
	return cli;
};

export function parseRuntimeCommand(
	argv: readonly string[],
	cwd = process.cwd(),
): RuntimeCommandInvocation {
	const effectiveArgv = argv.length === 0 ? [RuntimeCommand.Generate] : [...argv];
	const cli = createRuntimeCliApp({ generate: async () => {} }, cwd);
	cli.parse(["node", "pandwind-codemod runtime", ...effectiveArgv], { run: false });
	if (cli.matchedCommand === undefined)
		throw new Error(
			`pandwind-codemod runtime: unknown command '${effectiveArgv[0] ?? ""}'. Expected generate`,
		);
	cli.matchedCommand.checkUnknownOptions();
	cli.matchedCommand.checkOptionValue();
	cli.matchedCommand.checkRequiredArgs();
	cli.matchedCommand.checkUnusedArgs();
	return generateCommand(cwd, cli.args, cli.options as CliOptions);
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
					`generated runtime is stale: ${command.outFile}; run pandwind-codemod runtime generate to refresh it`,
				);
			console.log(`pandwind: generated runtime is up to date (${command.outFile})`);
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
			`pandwind: generated ${runtimeMethodSummary(command.methods)} runtime at ${command.outFile}`,
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
		cli.parse(["node", "pandwind-codemod runtime", ...effectiveArgv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("--help") || argv.includes("-h")) return;
			throw new Error(
				`pandwind-codemod runtime: unknown command '${argv[0] ?? ""}'. Expected generate`,
			);
		}
		await cli.runMatchedCommand();
	}
}

export const createRuntimeCli = (
	handlers: RuntimeCliHandlers = defaultHandlers,
	cwd = process.cwd(),
): RuntimeCli => new DefaultRuntimeCli(handlers, cwd);
