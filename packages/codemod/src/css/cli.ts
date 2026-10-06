#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { cac, type CAC, type Command } from "cac";
import {
	GENERATED_CSS_TYPES_HEADER,
	generateCssTypes,
	type GenerateCssTypesOptions,
} from "./generate-types.ts";
import { loadYumCSSPreset } from "../preset-loader.ts";
import type { ProjectModuleLoader } from "../swap/project-module-loader.ts";
import type { TokenVariableNames } from "yumcss/types/typings";

export const CssCommand = {
	Generate: "generate",
} as const;

export type CssCommandName = (typeof CssCommand)[keyof typeof CssCommand];

export interface CssGenerateCommand {
	readonly command: typeof CssCommand.Generate;
	readonly root: string;
	readonly outFile: string;
	readonly presetImport: string;
	readonly presetExport: string;
	readonly tokenVariableNames?: TokenVariableNames;
	readonly check: boolean;
}

export type CssCommandInvocation = CssGenerateCommand;

export interface CssCliHandlers {
	generate(command: CssGenerateCommand): Promise<void>;
}

export interface CssCli {
	run(argv: readonly string[]): Promise<void>;
}

export interface CssCliDependencies {
	readonly moduleLoader?: ProjectModuleLoader;
}

export const DEFAULT_CSS_TYPES_OUTPUT = "src/css.generated.ts";

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
		.option("--preset-import <module>", "Module that exports the YumCSS preset")
		.option("--preset-export <name>", "Preset export name; use 'default' for a default export")
		.option(
			"--token-variable-names <mode>",
			"Token custom-property names: hashed (default) or authored",
		)
		.option("--check", "Fail if the generated facade is missing or stale");
};

const optionTokenVariableNames = (options: CliOptions): TokenVariableNames | undefined => {
	const value = optionString(options, "tokenVariableNames");
	if (value === undefined) return undefined;
	if (value !== "hashed" && value !== "authored")
		throw new Error(`--token-variable-names must be 'hashed' or 'authored', got '${value}'`);
	return value;
};

const generateCommand = (
	cwd: string,
	positionals: readonly string[],
	options: CliOptions,
): CssGenerateCommand => {
	const root = resolve(cwd, positionals[0] ?? ".");
	const tokenVariableNames = optionTokenVariableNames(options);
	return {
		command: CssCommand.Generate,
		root,
		outFile: resolve(root, positionals[1] ?? DEFAULT_CSS_TYPES_OUTPUT),
		presetImport: optionString(options, "presetImport") ?? "./src/preset.ts",
		presetExport: optionString(options, "presetExport") ?? "preset",
		...(tokenVariableNames === undefined ? {} : { tokenVariableNames }),
		check: optionBoolean(options, "check"),
	};
};

const createCssCliApp = (handlers: CssCliHandlers, cwd: string): CAC => {
	const cli = cac("yumcss-codemod css");
	const generate = cli.command(
		"generate [root] [out-file]",
		"Generate a concrete typed YumCSS CSS facade from a preset",
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

export const parseCssCommand = (
	argv: readonly string[],
	cwd = process.cwd(),
): CssCommandInvocation => {
	const effectiveArgv = argv.length === 0 ? [CssCommand.Generate] : [...argv];
	const cli = createCssCliApp({ generate: async () => {} }, cwd);
	cli.parse(["node", "yumcss-codemod css", ...effectiveArgv], { run: false });
	if (cli.matchedCommand === undefined)
		throw new Error(
			`yumcss-codemod css: unknown command '${effectiveArgv[0] ?? ""}'. Expected generate`,
		);
	cli.matchedCommand.checkUnknownOptions();
	cli.matchedCommand.checkOptionValue();
	cli.matchedCommand.checkRequiredArgs();
	cli.matchedCommand.checkUnusedArgs();
	return generateCommand(cwd, cli.args, cli.options as CliOptions);
};

const isPackageSpecifier = (value: string): boolean =>
	!value.startsWith("/") && !value.startsWith(".");

const stripModuleExtension = (value: string): string => value.replace(/\.(?:[cm]?[jt]sx?)$/u, "");

const generatedPresetImport = (command: CssGenerateCommand): string => {
	if (isPackageSpecifier(command.presetImport)) return command.presetImport;
	const presetFile = resolve(command.root, command.presetImport);
	const outputRelativePath = relative(dirname(command.outFile), presetFile).replaceAll("\\", "/");
	const withoutExtension = stripModuleExtension(outputRelativePath);
	return withoutExtension.startsWith(".") ? withoutExtension : `./${withoutExtension}`;
};

const generatedOptions = (command: CssGenerateCommand): GenerateCssTypesOptions => ({
	presetImport: generatedPresetImport(command),
	presetExport: command.presetExport,
	tokenVariableNames: command.tokenVariableNames,
});

const defaultHandlers = (dependencies: CssCliDependencies): CssCliHandlers => ({
	async generate(command) {
		const preset = await loadYumCSSPreset(
			{
				root: command.root,
				presetImport: command.presetImport,
				presetExport: command.presetExport,
			},
			dependencies.moduleLoader,
		);
		const result = generateCssTypes(preset, generatedOptions(command));
		if (command.check) {
			if (!existsSync(command.outFile))
				throw new Error(`generated CSS types are missing: ${command.outFile}`);
			if (readFileSync(command.outFile, "utf8") !== result.source)
				throw new Error(
					`generated CSS types are stale: ${command.outFile}; run yumcss-codemod css generate to refresh it`,
				);
			console.log(`yumcss: generated CSS types are up to date (${command.outFile})`);
			return;
		}

		if (existsSync(command.outFile)) {
			const current = readFileSync(command.outFile, "utf8");
			if (current !== result.source && !current.startsWith(`${GENERATED_CSS_TYPES_HEADER}\n`))
				throw new Error(
					`refusing to overwrite non-generated file ${command.outFile}; choose another --out-file`,
				);
		}
		mkdirSync(dirname(command.outFile), { recursive: true });
		writeFileSync(command.outFile, result.source);
		console.log(
			`yumcss: generated CSS types at ${command.outFile} (${result.propertyCount} properties, ${result.conditionCount} conditions, ${result.tokenCount} tokens)`,
		);
	},
});

class DefaultCssCli implements CssCli {
	private readonly handlers: CssCliHandlers;
	private readonly cwd: string;

	constructor(handlers: CssCliHandlers, cwd: string) {
		this.handlers = handlers;
		this.cwd = cwd;
	}

	async run(argv: readonly string[]): Promise<void> {
		const cli = createCssCliApp(this.handlers, this.cwd);
		cli.help();
		const effectiveArgv = argv.length === 0 ? [CssCommand.Generate] : [...argv];
		cli.parse(["node", "yumcss-codemod css", ...effectiveArgv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("--help") || argv.includes("-h")) return;
			throw new Error(
				`yumcss-codemod css: unknown command '${argv[0] ?? ""}'. Expected generate`,
			);
		}
		await cli.runMatchedCommand();
	}
}

export const createCssCli = (dependencies: CssCliDependencies = {}, cwd = process.cwd()): CssCli =>
	new DefaultCssCli(defaultHandlers(dependencies), cwd);
