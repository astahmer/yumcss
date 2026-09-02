#!/usr/bin/env nub
/**
 * The one user-facing Tailwind tooling command.
 *
 * `generate` owns the generated design-system artifacts and can optionally
 * compose the css() bridge. `scan` and `prune` stay explicit because they are
 * source/runtime fallbacks and optimization passes, not required codegen.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CodegenArtifactWriter } from "./codegen-writer.ts";
import { generateTwBridge } from "./generate-bridge.ts";
import { loadThemeBlock } from "./codegen-theme-input.ts";
import { generateDesignSystem } from "./generate-types.ts";
import { runTwPrune } from "./prune-theme.ts";
import { runTwScan } from "./collect.ts";

/** Runtime-safe identity values for the Node CLI boundary. */
export const TwCommand = {
	Generate: "generate",
	Scan: "scan",
	Prune: "prune",
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

export type TwCommandInvocation = TwGenerateCommand | TwScanCommand | TwPruneCommand;

const DEFAULT_PRESET_IMPORT = "pandwind/preset";
const DEFAULT_PRESET_EXPORT = "examplePreset";

const optionValue = (args: readonly string[], index: number, flag: string): string => {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`pandwind-tw: ${flag} requires a value`);
	}
	return value;
};

const assertPositionals = (positionals: readonly string[], max: number, command: string): void => {
	if (positionals.length > max) {
		throw new Error(`pandwind-tw: too many positional arguments for ${command}`);
	}
};

export function parseTwCommand(argv: readonly string[], cwd = process.cwd()): TwCommandInvocation {
	const [requestedCommand, ...rest] = argv;
	const command = requestedCommand ?? TwCommand.Generate;
	if (command !== TwCommand.Generate && command !== TwCommand.Scan && command !== TwCommand.Prune) {
		throw new Error(`pandwind-tw: unknown command '${command}'. Expected generate, scan, or prune`);
	}

	if (command === TwCommand.Generate) {
		const positionals: string[] = [];
		let tokensModule: string | undefined;
		let agents = false;
		let bridge = false;
		let bridgeFile: string | undefined;
		let presetImport = DEFAULT_PRESET_IMPORT;
		let presetExport = DEFAULT_PRESET_EXPORT;
		for (let index = 0; index < rest.length; index++) {
			const arg = rest[index];
			if (arg === undefined) continue;
			if (arg === "--tokens") tokensModule = optionValue(rest, index++, arg);
			else if (arg === "--agents") agents = true;
			else if (arg === "--bridge") bridge = true;
			else if (arg === "--bridge-file") {
				bridge = true;
				bridgeFile = optionValue(rest, index++, arg);
			} else if (arg === "--preset-import") {
				bridge = true;
				presetImport = optionValue(rest, index++, arg);
			} else if (arg === "--preset-export") {
				bridge = true;
				presetExport = optionValue(rest, index++, arg);
			} else if (arg === "--help") {
				throw new Error(TW_USAGE);
			} else {
				positionals.push(arg);
			}
		}
		assertPositionals(positionals, 2, command);
		const cssEntry = resolve(cwd, positionals[0] ?? "src/tailwind.css");
		const outDir = resolve(cwd, positionals[1] ?? "src");
		return {
			command,
			cssEntry,
			outDir,
			cwd,
			...(tokensModule === undefined ? {} : { tokensModule }),
			agents,
			bridge,
			bridgeFile: resolve(cwd, bridgeFile ?? `${positionals[1] ?? "src"}/bridge.ts`),
			presetImport,
			presetExport,
		};
	}

	if (rest.includes("--help")) throw new Error(TW_USAGE);
	if (rest.some((arg) => arg.startsWith("--"))) {
		throw new Error(`pandwind-tw: ${command} does not accept options`);
	}
	assertPositionals(rest, 3, command);
	if (command === TwCommand.Scan) {
		return {
			command,
			twEntry: resolve(cwd, rest[0] ?? "src/tw.ts"),
			srcDir: resolve(cwd, rest[1] ?? "src"),
			outFile: resolve(cwd, rest[2] ?? "src/pandwind.safelist.ts"),
		};
	}
	return {
		command,
		themeCss: resolve(cwd, rest[0] ?? "src/pandwind-theme.css"),
		twEntry: resolve(cwd, rest[1] ?? "src/tw.ts"),
		srcDir: resolve(cwd, rest[2] ?? "src"),
		base: cwd,
	};
}

export interface TwCliHandlers {
	generate(command: TwGenerateCommand): Promise<void>;
	scan(command: TwScanCommand): Promise<void>;
	prune(command: TwPruneCommand): Promise<void>;
}

export interface TwCli {
	run(argv: readonly string[]): Promise<void>;
}

const TW_USAGE = `Usage:
  pandwind-tw generate [css-entry] [out-dir] [--tokens <module>] [--agents]
                       [--bridge] [--bridge-file <path>]
                       [--preset-import <module>] [--preset-export <name>]
  pandwind-tw scan [tw-entry] [src-dir] [out-file]
  pandwind-tw prune [theme-css] [tw-entry] [src-dir]`;

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
			{ outDir: command.outDir, agents: command.agents },
		);
		if (command.bridge) {
			const bridge = await generateTwBridge({
				cssEntry: command.cssEntry,
				twFile: resolve(command.outDir, "tw.ts"),
				outFile: command.bridgeFile,
				presetImport: command.presetImport,
				presetExport: command.presetExport,
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
			`pandwind: wrote ${result.classes.length} ${result.mode === "css" ? "@source inline directives" : "classes"} to ${result.outFile}`,
		);
	},
	async prune(command) {
		const result = await runTwPrune(command);
		console.log(
			`pandwind: pruned ${result.themeCss} (${result.beforeVariables} -> ${result.afterVariables} theme vars from ${result.scannedFiles} scanned files)`,
		);
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
		const invocation = parseTwCommand(argv, this.cwd);
		if (invocation.command === TwCommand.Generate) return this.handlers.generate(invocation);
		if (invocation.command === TwCommand.Scan) return this.handlers.scan(invocation);
		return this.handlers.prune(invocation);
	}
}

export const createTwCli = (
	handlers: TwCliHandlers = defaultHandlers,
	cwd = process.cwd(),
): TwCli => new DefaultTwCli(handlers, cwd);

if (process.argv[1]?.endsWith("cli.ts")) {
	try {
		await createTwCli().run(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
