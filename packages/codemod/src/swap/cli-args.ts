import cac, { type Command } from "cac";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import type { AdapterCapabilityMode } from "./capabilities.ts";
import { CodemodAdapterId, SwapTargetId } from "./identifiers.ts";
import { SWAP_REGISTRY } from "./swap-registry.ts";
import type { TokenRefMode } from "./tokens.ts";
import type { ExternalAdapterId } from "./external-adapters.ts";

const builtinAdapterIds = createBuiltinCodemodCatalog().adapters.map((adapter) => adapter.id);

export const SWAP_TARGETS = [
	...SWAP_REGISTRY.targets.map((adapter) => adapter.id),
	...builtinAdapterIds,
];
export type SwapTarget = SwapTargetId | CodemodAdapterId | ExternalAdapterId;

export const SWAP_SOURCES = [
	...SWAP_REGISTRY.sources.map((adapter) => adapter.id),
	CodemodAdapterId.Panda,
	...builtinAdapterIds,
] as const;
export type SwapSource = (typeof SWAP_SOURCES)[number];

export interface SwapCliArgs {
	from: SwapSource;
	to: SwapTarget;
	write: boolean;
	diff: boolean;
	report: boolean;
	patterns: string[];
	metaDir: string;
	skipMarker: string;
	tokenRefs: TokenRefMode;
	engine: boolean;
	tokenize: boolean;
	sort: boolean;
	dedup: boolean;
	/** Output folder for --from=panda project migration (default "pandwind"). */
	outDir: string;
	/** Regenerate existing panda migration modules. */
	force: boolean;
	/** Capability policy for adapter routes; external routes default to safe. */
	capabilityMode?: AdapterCapabilityMode;
	reportFormat: "text" | "json";
}

export function configureSwapCommand(command: Command): void {
	command
		.option("--from <adapter>", "Source adapter or auto-detect", { default: "auto" })
		.option("--to <adapter>", "Target adapter", { default: SwapTargetId.CssClass })
		.option("--write", "Apply the migration to files")
		.option("--diff", "Print unified diffs")
		.option("--report", "Print migration reports")
		.option("--report-format <format>", "Report format: text or json", { default: "text" })
		.option("--safe", "Require the target capability contract")
		.option("--partial", "Allow partial target lowering")
		.option("--out <dir>", "Output folder for project migrations", { default: "" })
		.option("--force", "Regenerate existing project migration modules")
		.option("--meta <dir>", "Generated Pandwind metadata directory", { default: "" })
		.option("--skip-marker <text>", "Marker used to preserve opted-out sites", {
			default: "pandwind:migrate-skip",
		})
		.option("--token-refs <mode>", "Token references: off, bare, or group", { default: "bare" })
		.option("--engine", "Resolve unknown Tailwind utilities through the engine")
		.option("--tokenize", "Rewrite eligible raw values to token references")
		.option("--sort", "Sort emitted declarations canonically")
		.option("--dedup", "Hoist repeated literal style calls");
}

const normalizeReportSyntax = (argv: readonly string[]): string[] => {
	const normalized: string[] = [];
	for (const argument of argv) {
		if (argument.startsWith("--report=")) {
			normalized.push("--report", `--report-format=${argument.slice("--report=".length)}`);
		} else normalized.push(argument);
	}
	return normalized;
};

const validateCommand = (command: Command): void => {
	command.checkUnknownOptions();
	command.checkOptionValue();
	command.checkRequiredArgs();
	command.checkUnusedArgs();
};

const optionString = (
	options: Readonly<Record<string, unknown>>,
	name: string,
): string | undefined => {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
};

const optionBoolean = (options: Readonly<Record<string, unknown>>, name: string): boolean =>
	options[name] === true;

const choice = <T extends string>(
	name: string,
	value: string | undefined,
	options: readonly T[],
): T => {
	if (value !== undefined && options.includes(value as T)) return value as T;
	throw new Error(
		`codemod swap: unknown --${name} '${value ?? ""}' (expected ${options.join("|")})`,
	);
};

export function parseSwapArgs(argv: string[]): SwapCliArgs {
	const cli = cac("pandwind-codemod swap");
	const command = cli.command("[...patterns]", "Migrate a source adapter into a target adapter");
	configureSwapCommand(command);
	cli.parse(["node", "pandwind-codemod swap", ...normalizeReportSyntax(argv)], { run: false });
	const matched = cli.matchedCommand;
	if (matched === undefined) throw new Error("codemod swap: no input patterns given");
	validateCommand(matched);
	if (cli.args.length === 0) {
		throw new Error(
			"codemod swap: no input patterns given.\nusage: pandwind-codemod swap [options] <globs...>",
		);
	}
	const options = cli.options as Readonly<Record<string, unknown>>;
	const from = choice("from", optionString(options, "from"), SWAP_SOURCES);
	const to = choice("to", optionString(options, "to"), SWAP_TARGETS);
	const tokenRefs = choice("token-refs", optionString(options, "tokenRefs"), [
		"off",
		"bare",
		"group",
	] as const);
	const reportFormat = choice("report-format", optionString(options, "reportFormat"), [
		"text",
		"json",
	] as const);
	const safe = optionBoolean(options, "safe");
	const partial = optionBoolean(options, "partial");
	if (safe && partial) throw new Error("codemod swap: --safe and --partial are mutually exclusive");
	return {
		from,
		to,
		write: optionBoolean(options, "write"),
		diff: optionBoolean(options, "diff"),
		report: optionBoolean(options, "report"),
		patterns: [...cli.args],
		metaDir: optionString(options, "meta") ?? "",
		skipMarker: optionString(options, "skipMarker") ?? "pandwind:migrate-skip",
		tokenRefs,
		engine: optionBoolean(options, "engine"),
		tokenize: optionBoolean(options, "tokenize"),
		sort: optionBoolean(options, "sort"),
		dedup: optionBoolean(options, "dedup"),
		outDir: optionString(options, "out") ?? "",
		force: optionBoolean(options, "force"),
		capabilityMode: safe ? "safe" : partial ? "partial" : undefined,
		reportFormat,
	};
}
