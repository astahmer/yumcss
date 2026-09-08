#!/usr/bin/env node
/**
 * The one user-facing Tailwind tooling command.
 *
 * `generate` owns the generated design-system artifacts and can optionally
 * compose the css() bridge. `scan` and `prune` stay explicit because they are
 * source/runtime fallbacks and optimization passes, not required codegen.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cac, type CAC, type Command } from "cac";
import { CodegenArtifactWriter } from "./codegen-writer.ts";
import { generateTwBridge } from "./generate-bridge.ts";
import { loadThemeBlock } from "./codegen-theme-input.ts";
import { generateDesignSystem } from "./generate-types.ts";
import { runTwPrune } from "./prune-theme.ts";
import { runTwScan } from "pandwind/tw/collect";

/** Runtime-safe identity values for the Node CLI boundary. */
export const TwCommand = {
	Generate: "generate",
	Scan: "scan",
	Prune: "prune",
	Manifest: "manifest",
} as const;

export type TwCommandName = (typeof TwCommand)[keyof typeof TwCommand];

export interface TwGenerateCommand {
	readonly command: typeof TwCommand.Generate;
	readonly cssEntry: string;
	readonly outDir: string;
	readonly cwd: string;
	readonly tokensModule?: string;
	readonly agents: boolean;
	readonly bridge: boolean;
	readonly bridgeFile: string;
	readonly presetImport: string;
	readonly presetExport: string;
}

export interface TwScanCommand {
	readonly command: typeof TwCommand.Scan;
	readonly twEntry: string;
	readonly srcDir: string;
	readonly outFile: string;
}

export interface TwPruneCommand {
	readonly command: typeof TwCommand.Prune;
	readonly themeCss: string;
	readonly twEntry: string;
	readonly srcDir: string;
	readonly base: string;
}

export interface TwManifestCommand {
	readonly command: typeof TwCommand.Manifest;
	readonly outDir: string;
	readonly inputFiles: readonly string[];
	readonly cwd: string;
}

export type TwCommandInvocation =
	| TwGenerateCommand
	| TwScanCommand
	| TwPruneCommand
	| TwManifestCommand;

const DEFAULT_PRESET_IMPORT = "pandwind/preset";
const DEFAULT_PRESET_EXPORT = "examplePreset";

export interface TwCliHandlers {
	generate(command: TwGenerateCommand): Promise<void>;
	scan(command: TwScanCommand): Promise<void>;
	prune(command: TwPruneCommand): Promise<void>;
	manifest(command: TwManifestCommand): Promise<void>;
}

export interface TwCli {
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

const generateCommand = (
	cwd: string,
	positionals: readonly string[],
	options: CliOptions,
): TwGenerateCommand => {
	const cssEntry = positionals[0] ?? "src/tailwind.css";
	const outDir = positionals[1] ?? "src";
	const bridgeFile = optionString(options, "bridgeFile");
	return {
		command: TwCommand.Generate,
		cssEntry: resolve(cwd, cssEntry),
		outDir: resolve(cwd, outDir),
		cwd,
		...(optionString(options, "tokens") === undefined
			? {}
			: { tokensModule: optionString(options, "tokens") }),
		agents: optionBoolean(options, "agents"),
		bridge: optionBoolean(options, "bridge") || bridgeFile !== undefined,
		bridgeFile: resolve(cwd, bridgeFile ?? `${outDir}/bridge.ts`),
		presetImport: optionString(options, "presetImport") ?? DEFAULT_PRESET_IMPORT,
		presetExport: optionString(options, "presetExport") ?? DEFAULT_PRESET_EXPORT,
	};
};

const scanCommand = (cwd: string, positionals: readonly string[]): TwScanCommand => ({
	command: TwCommand.Scan,
	twEntry: resolve(cwd, positionals[0] ?? "src/tw.ts"),
	srcDir: resolve(cwd, positionals[1] ?? "src"),
	outFile: resolve(cwd, positionals[2] ?? "src/pandwind.safelist.css"),
});

const pruneCommand = (cwd: string, positionals: readonly string[]): TwPruneCommand => ({
	command: TwCommand.Prune,
	themeCss: resolve(cwd, positionals[0] ?? "src/pandwind-theme.css"),
	twEntry: resolve(cwd, positionals[1] ?? "src/tw.ts"),
	srcDir: resolve(cwd, positionals[2] ?? "src"),
	base: cwd,
});

const manifestCommand = (cwd: string, positionals: readonly string[]): TwManifestCommand => ({
	command: TwCommand.Manifest,
	outDir: resolve(cwd, positionals[0] ?? "src"),
	inputFiles: (positionals.length > 1 ? positionals.slice(1) : ["src/tailwind.css"]).map((file) =>
		resolve(cwd, file),
	),
	cwd,
});

const configureGenerate = (command: Command): void => {
	command
		.option("--tokens <module>", "Token module to bridge into the generated theme")
		.option("--agents", "Write the machine-readable pandwind.agents.json artifact")
		.option("--bridge", "Generate the css() bridge and refresh interop metadata")
		.option("--bridge-file <path>", "Output path for the generated bridge module")
		.option("--preset-import <module>", "Module specifier for the bridge preset")
		.option("--preset-export <name>", "Export name for the bridge preset");
};

const createTwCliApp = (handlers: TwCliHandlers, cwd: string): CAC => {
	const cli = cac("pandwind-codemod tw");
	const generate = cli.command(
		"generate [css-entry] [out-dir]",
		"Generate typed Tailwind artifacts from a CSS entrypoint",
	);
	configureGenerate(generate);
	generate.action((...actionArgs: Array<unknown>) => {
		const options = (actionArgs.at(-1) ?? {}) as CliOptions;
		return handlers.generate(
			generateCommand(cwd, actionPositionals(actionArgs.slice(0, -1)), options),
		);
	});

	const scan = cli.command(
		"scan [tw-entry] [src-dir] [out-file]",
		"Collect dynamic classes into a safelist",
	);
	scan.action((...actionArgs: Array<unknown>) =>
		handlers.scan(scanCommand(cwd, actionPositionals(actionArgs.slice(0, -1)))),
	);

	const prune = cli.command(
		"prune [theme-css] [tw-entry] [src-dir]",
		"Prune unused theme variables from the generated stylesheet",
	);
	prune.action((...actionArgs: Array<unknown>) =>
		handlers.prune(pruneCommand(cwd, actionPositionals(actionArgs.slice(0, -1)))),
	);

	const manifest = cli.command(
		"manifest [out-dir] [input-files...]",
		"Refresh the generated artifact manifest after formatting or other file transforms",
	);
	manifest.action((...actionArgs: Array<unknown>) =>
		handlers.manifest(manifestCommand(cwd, actionPositionals(actionArgs.slice(0, -1)))),
	);
	return cli;
};

const commandName = (argv: readonly string[]): string | undefined =>
	argv.find((argument) => !argument.startsWith("-"));

export function parseTwCommand(argv: readonly string[], cwd = process.cwd()): TwCommandInvocation {
	const effectiveArgv = argv.length === 0 ? [TwCommand.Generate] : [...argv];
	const cli = createTwCliApp(
		{
			generate: async () => {},
			scan: async () => {},
			prune: async () => {},
			manifest: async () => {},
		},
		cwd,
	);
	cli.parse(["node", "pandwind-codemod tw", ...effectiveArgv], { run: false });
	const matched = cli.matchedCommand;
	if (matched === undefined) {
		const requested = commandName(effectiveArgv);
		throw new Error(
			`pandwind-codemod tw: unknown command '${requested ?? ""}'. Expected generate, scan, prune, or manifest`,
		);
	}
	matched.checkUnknownOptions();
	matched.checkOptionValue();
	matched.checkRequiredArgs();
	matched.checkUnusedArgs();
	if (matched.name === TwCommand.Generate) return generateCommand(cwd, cli.args, cli.options);
	if (matched.name === TwCommand.Scan) return scanCommand(cwd, cli.args);
	if (matched.name === TwCommand.Prune) return pruneCommand(cwd, cli.args);
	return manifestCommand(cwd, cli.args);
}

const defaultHandlers: TwCliHandlers = {
	async generate(command) {
		mkdirSync(command.outDir, { recursive: true });
		const themeBlock =
			command.tokensModule === undefined
				? ""
				: await loadThemeBlock(command.tokensModule, command.cwd);
		const source = await generateDesignSystem(
			readFileSync(command.cssEntry, "utf8"),
			dirname(command.cssEntry),
			{ themeBlock },
		);
		new CodegenArtifactWriter().write(
			{ ...source, themeBlock },
			{
				outDir: command.outDir,
				agents: command.agents,
				projectRoot: command.cwd,
				inputs: [{ path: command.cssEntry, content: readFileSync(command.cssEntry, "utf8") }],
			},
		);
		if (command.bridge) {
			mkdirSync(dirname(command.bridgeFile), { recursive: true });
			const bridge = await generateTwBridge({
				cssEntry: command.cssEntry,
				twFile: resolve(command.outDir, "tw.ts"),
				outFile: command.bridgeFile,
				presetImport: command.presetImport,
				presetExport: command.presetExport,
			});
			new CodegenArtifactWriter().writeManifest({
				outDir: command.outDir,
				projectRoot: command.cwd,
				inputs: [{ path: command.cssEntry, content: readFileSync(command.cssEntry, "utf8") }],
			});
			console.log(
				`pandwind: generated types.d.ts (${source.utilityCount} utilities, ${source.variantCount} variants), tw.ts, and bridge.ts (${bridge.propertyCount} properties)`,
			);
			return;
		}
		console.log(
			`pandwind: generated types.d.ts (${source.utilityCount} utilities, ${source.variantCount} variants) and tw.ts`,
		);
	},
	async scan(command) {
		const result = await runTwScan(command);
		console.log(
			`pandwind: wrote ${result.classes.length} @source inline directives to ${result.outFile}`,
		);
		const unresolved = result.unresolvedTokens ?? [];
		if (unresolved.length > 0) {
			for (const { token, line } of unresolved) {
				console.warn(
					`pandwind: unresolved dynamic candidate "${token}" (line ${line}) — no exact design-system CSS; stays on the runtime path`,
				);
			}
			console.warn(
				`pandwind: ${unresolved.length} dynamic candidate(s) need a static branch, safelist entry, or css.vars lowering`,
			);
		}
	},
	async prune(command) {
		const result = await runTwPrune(command);
		console.log(
			`pandwind: pruned ${result.themeCss} (${result.beforeVariables} -> ${result.afterVariables} theme vars from ${result.scannedFiles} scanned files)`,
		);
	},
	async manifest(command) {
		new CodegenArtifactWriter().writeManifest({
			outDir: command.outDir,
			projectRoot: command.cwd,
			inputs: command.inputFiles.map((path) => ({ path, content: readFileSync(path, "utf8") })),
		});
		console.log(`pandwind: refreshed generated artifact manifest in ${command.outDir}`);
	},
};

class DefaultTwCli implements TwCli {
	private readonly handlers: TwCliHandlers;
	private readonly cwd: string;

	constructor(handlers: TwCliHandlers, cwd: string) {
		this.handlers = handlers;
		this.cwd = cwd;
	}

	async run(argv: readonly string[]): Promise<void> {
		const cli = createTwCliApp(this.handlers, this.cwd);
		cli.help();
		const effectiveArgv = argv.length === 0 ? [TwCommand.Generate] : [...argv];
		cli.parse(["node", "pandwind-codemod tw", ...effectiveArgv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("--help") || argv.includes("-h")) return;
			throw new Error(
				`pandwind-codemod tw: unknown command '${argv[0] ?? ""}'. Expected generate, scan, prune, or manifest`,
			);
		}
		await cli.runMatchedCommand();
	}
}

export const createTwCli = (
	handlers: TwCliHandlers = defaultHandlers,
	cwd = process.cwd(),
): TwCli => new DefaultTwCli(handlers, cwd);
