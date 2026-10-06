#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cac, type CAC, type Command } from "cac";
import type { CssCascade } from "yumcss/css";
import { type CssConfigReturn } from "yumcss/types/typings";
import {
	YUMCSS_LIB_GENERATOR,
	YUMCSS_LIB_SCHEMA,
	validateYumCSSLibArtifact,
	type YumCSSLibArtifact,
} from "yumcss/vite/lib-artifact";
import {
	NODE_PROJECT_MODULE_LOADER,
	type ProjectModuleLoader,
} from "../swap/project-module-loader.ts";
import { buildYumCSSLib } from "./build.ts";

export const LibCommand = {
	Build: "build",
} as const;

export type LibCommandName = (typeof LibCommand)[keyof typeof LibCommand];

export interface LibBuildCommand {
	readonly command: typeof LibCommand.Build;
	readonly root: string;
	readonly outFile: string;
	readonly sourcePatterns: readonly string[];
	readonly cssSources: readonly string[];
	readonly presetImport: string;
	readonly presetExport: string;
	readonly namespace?: string;
	readonly cascade?: CssCascade;
	readonly check: boolean;
}

export type LibCommandInvocation = LibBuildCommand;

export interface LibCliHandlers {
	build(command: LibBuildCommand): Promise<void>;
}

export interface LibCli {
	run(argv: readonly string[]): Promise<void>;
}

export interface LibCliDependencies {
	readonly moduleLoader?: ProjectModuleLoader;
}

type CliOptions = Readonly<Record<string, unknown>>;

const optionString = (options: CliOptions, name: string): string | undefined => {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
};

const optionBoolean = (options: CliOptions, name: string): boolean => options[name] === true;

const optionStrings = (
	options: CliOptions,
	name: string,
	fallback: readonly string[],
): string[] => {
	const value = options[name];
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
	if (typeof value === "string") return [value];
	return [...fallback];
};

const actionPositionals = (args: readonly unknown[]): string[] =>
	args.filter((value): value is string => typeof value === "string");

const parseCascade = (
	mode: string | undefined,
	layer: string | undefined,
): CssCascade | undefined => {
	if (mode === undefined && layer === undefined) return undefined;
	if (mode === "specificity" && layer !== undefined)
		throw new Error("yumcss-codemod lib: --cascade-layer requires --cascade layers");
	if (mode !== "layers" && layer !== undefined)
		throw new Error("yumcss-codemod lib: --cascade-layer requires --cascade layers");
	if (mode === undefined || (mode !== "specificity" && mode !== "layers"))
		throw new Error(`yumcss-codemod lib: unsupported cascade '${mode}'`);
	return layer === undefined ? mode : { mode: "layers", layer };
};

const generateCommand = (
	cwd: string,
	positionals: readonly string[],
	options: CliOptions,
): LibBuildCommand => {
	const root = resolve(cwd, positionals[0] ?? ".");
	const cascade = parseCascade(
		optionString(options, "cascade"),
		optionString(options, "cascadeLayer"),
	);
	return {
		command: LibCommand.Build,
		root,
		outFile: resolve(root, positionals[1] ?? "dist/yumcss.lib.json"),
		sourcePatterns: optionStrings(options, "include", ["**/*"]),
		cssSources: optionStrings(options, "cssSource", ["css", "design"]),
		presetImport: optionString(options, "presetImport") ?? "yumcss/preset/default",
		presetExport: optionString(options, "presetExport") ?? "defaultPreset",
		...(optionString(options, "namespace") === undefined
			? {}
			: { namespace: optionString(options, "namespace") }),
		...(cascade === undefined ? {} : { cascade }),
		check: optionBoolean(options, "check"),
	};
};

const configureBuild = (command: Command): void => {
	command
		.option("--include <pattern>", "Source glob to scan; repeat for multiple globs")
		.option("--css-source <source>", "CSS module import matcher; repeat for multiple matchers")
		.option("--preset-import <module>", "Module that exports the YumCSS preset")
		.option("--preset-export <name>", "Preset export name")
		.option("--namespace <name>", "Dynamic-value namespace; defaults to pw")
		.option("--cascade <mode>", "Compatibility mode: specificity or layers")
		.option("--cascade-layer <name>", "Named layer when --cascade is layers")
		.option("--check", "Fail if the generated artifact is missing or stale");
};

const createLibCliApp = (handlers: LibCliHandlers, cwd: string): CAC => {
	const cli = cac("yumcss-codemod lib");
	const build = cli.command(
		"build [root] [out-file]",
		"Build a publishable YumCSS design-system artifact",
	);
	configureBuild(build);
	build.action((...actionArgs: Array<unknown>) => {
		const options = (actionArgs.at(-1) ?? {}) as CliOptions;
		return handlers.build(
			generateCommand(cwd, actionPositionals(actionArgs.slice(0, -1)), options),
		);
	});
	return cli;
};

export const parseLibCommand = (
	argv: readonly string[],
	cwd = process.cwd(),
): LibCommandInvocation => {
	const effectiveArgv = argv.length === 0 ? [LibCommand.Build] : [...argv];
	const cli = createLibCliApp({ build: async () => {} }, cwd);
	cli.parse(["node", "yumcss-codemod lib", ...effectiveArgv], { run: false });
	if (cli.matchedCommand === undefined)
		throw new Error(
			`yumcss-codemod lib: unknown command '${effectiveArgv[0] ?? ""}'. Expected build`,
		);
	cli.matchedCommand.checkUnknownOptions();
	cli.matchedCommand.checkOptionValue();
	cli.matchedCommand.checkRequiredArgs();
	cli.matchedCommand.checkUnusedArgs();
	return generateCommand(cwd, cli.args, cli.options as CliOptions);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPreset = (value: unknown): value is CssConfigReturn =>
	isRecord(value) &&
	isRecord(value.conditions) &&
	isRecord(value.properties) &&
	typeof value.strict === "boolean" &&
	isRecord(value.tokens);

const isPackageSpecifier = (value: string): boolean =>
	!value.startsWith("/") && !value.startsWith(".");

const loadPreset = async (
	command: LibBuildCommand,
	moduleLoader: ProjectModuleLoader,
): Promise<CssConfigReturn> => {
	const module = isPackageSpecifier(command.presetImport)
		? await moduleLoader.importPackage<Record<string, unknown>>(command.presetImport, command.root)
		: await moduleLoader.importFile<Record<string, unknown>>(
				resolve(command.root, command.presetImport),
			);
	if (module === undefined) {
		throw new Error(
			`yumcss-codemod lib build: could not load preset module ${command.presetImport} from ${command.root}`,
		);
	}
	const preset = command.presetExport === "default" ? module.default : module[command.presetExport];
	if (!isPreset(preset)) {
		throw new Error(
			`yumcss-codemod lib build: export ${command.presetExport} from ${command.presetImport} is not a YumCSS preset`,
		);
	}
	return preset;
};

const artifactSource = (artifact: YumCSSLibArtifact): string =>
	`${JSON.stringify(artifact, null, "\t")}\n`;

const isGeneratedLibArtifact = (value: unknown): boolean =>
	isRecord(value) && value.schema === YUMCSS_LIB_SCHEMA && value.generator === YUMCSS_LIB_GENERATOR;

const defaultHandlers = (dependencies: LibCliDependencies): LibCliHandlers => ({
	async build(command) {
		const preset = await loadPreset(
			command,
			dependencies.moduleLoader ?? NODE_PROJECT_MODULE_LOADER,
		);
		const result = buildYumCSSLib({
			root: command.root,
			preset,
			sourcePatterns: command.sourcePatterns,
			cssSources: command.cssSources,
			namespace: command.namespace,
			cascade: command.cascade,
		});
		const source = artifactSource(result.artifact);
		if (command.check) {
			if (!existsSync(command.outFile))
				throw new Error(`generated YumCSS lib artifact is missing: ${command.outFile}`);
			if (readFileSync(command.outFile, "utf8") !== source)
				throw new Error(
					`generated YumCSS lib artifact is stale: ${command.outFile}; run yumcss-codemod lib build to refresh it`,
				);
			console.log(`yumcss: lib artifact is up to date (${command.outFile})`);
			return;
		}
		if (existsSync(command.outFile)) {
			let current: unknown;
			try {
				current = JSON.parse(readFileSync(command.outFile, "utf8"));
			} catch {
				throw new Error(`refusing to overwrite non-generated file ${command.outFile}`);
			}
			if (!isGeneratedLibArtifact(current) && !validateYumCSSLibArtifact(current).valid)
				throw new Error(`refusing to overwrite non-generated file ${command.outFile}`);
		}
		mkdirSync(dirname(command.outFile), { recursive: true });
		writeFileSync(command.outFile, source);
		console.log(
			`yumcss: wrote lib artifact ${command.outFile} (${result.files.length} source file(s), ${result.artifact.rules.atomic.length + result.artifact.rules.vars.length} rule(s))`,
		);
	},
});

class DefaultLibCli implements LibCli {
	private readonly handlers: LibCliHandlers;
	private readonly cwd: string;

	constructor(handlers: LibCliHandlers, cwd: string) {
		this.handlers = handlers;
		this.cwd = cwd;
	}

	async run(argv: readonly string[]): Promise<void> {
		const cli = createLibCliApp(this.handlers, this.cwd);
		cli.help();
		const effectiveArgv = argv.length === 0 ? [LibCommand.Build] : [...argv];
		cli.parse(["node", "yumcss-codemod lib", ...effectiveArgv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("--help") || argv.includes("-h")) return;
			throw new Error(`yumcss-codemod lib: unknown command '${argv[0] ?? ""}'. Expected build`);
		}
		await cli.runMatchedCommand();
	}
}

export const createLibCli = (dependencies: LibCliDependencies = {}, cwd = process.cwd()): LibCli =>
	new DefaultLibCli(defaultHandlers(dependencies), cwd);
