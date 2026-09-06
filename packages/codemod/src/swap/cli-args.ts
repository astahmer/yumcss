import cac, { type Command } from "cac";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import type { AdapterCapabilityMode } from "./capabilities.ts";
import { CodemodAdapterId, SwapSourceId, SwapTargetId } from "./identifiers.ts";
import { SWAP_REGISTRY } from "./swap-registry.ts";
import type { TokenRefMode } from "./tokens.ts";
import type { ExternalAdapterId } from "./external-adapters.ts";
import type { MigrateMode } from "../migrate.ts";
import { parseSourceList, type SourceId } from "../sources.ts";

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

/** The single CLI contract for project and file migrations. */
export interface MigrateCliArgs {
	from: SwapSource;
	to: SwapTarget | MigrateMode;
	/** Project root; defaults to the current working directory or an absolute-pattern root. */
	root?: string;
	dryRun: boolean;
	/** Install target dependencies after a successful write; enabled by default. */
	install: boolean;
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
	sources: readonly SourceId[];
}

export function configureMigrateCommand(command: Command): void {
	command
		.option("-f, --from <adapter>", "Source adapter or auto-detect", { default: "auto" })
		.option("-t, --to <adapter>", "Target adapter or Pandwind API", {
			default: SwapTargetId.CssClass,
		})
		.option("--dry-run", "Preview the migration without writing files")
		.option("--root <dir>", "Project root (defaults to cwd or the absolute-pattern root)")
		.option("--install, --no-install", "Install target dependencies after a successful write", {
			default: true,
		})
		.option("--diff", "Print unified diffs")
		.option("--report", "Print migration reports")
		.option("--report-format <format>", "Report format: text or json", { default: "text" })
		.option("--safe", "Require the target capability contract")
		.option("--partial", "Allow partial target lowering")
		.option("--out <dir>", "Output folder for project migrations")
		.option("--force", "Regenerate existing project migration modules")
		.option("--meta <dir>", "Generated Pandwind metadata directory")
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

const CLI_IDENTIFIERS = new Map<string, string>([
	["tailwindcss", CodemodAdapterId.Tailwind],
	["tw", SwapTargetId.Tw],
	["pandwind-tw", SwapTargetId.Tw],
	["pandwind-css", SwapTargetId.CssClass],
	["pandwind-dss", SwapTargetId.Dss],
	["pandwind", CodemodAdapterId.Pandwind],
	["chakra", CodemodAdapterId.ChakraUi],
	["chakra-ui-v3", CodemodAdapterId.ChakraUi],
	["uno", CodemodAdapterId.UnoCSS],
	["unocss", CodemodAdapterId.UnoCSS],
	["styled-components", CodemodAdapterId.StyledComponents],
]);

const canonicalIdentifier = (value: string): string => CLI_IDENTIFIERS.get(value) ?? value;

const choice = <T extends string>(
	name: string,
	value: string | undefined,
	options: readonly T[],
): T => {
	if (value !== undefined && options.includes(value as T)) return value as T;
	throw new Error(
		`codemod migrate: unknown --${name} '${value ?? ""}' (expected ${options.join("|")})`,
	);
};

const MIGRATE_MODES: readonly MigrateMode[] = ["tw", "cx", "css", "keep"];

export function parseMigrateArgs(argv: string[]): MigrateCliArgs {
	const cli = cac("pandwind-codemod migrate");
	const command = cli.command("[...patterns]", "Migrate a project between styling adapters");
	configureMigrateCommand(command);
	cli.parse(["node", "pandwind-codemod migrate", ...normalizeReportSyntax(argv)], { run: false });
	const matched = cli.matchedCommand;
	if (matched === undefined) throw new Error("codemod migrate: no input patterns given");
	validateCommand(matched);
	if (cli.args.length === 0) {
		throw new Error(
			"codemod migrate: no input patterns given.\nusage: pandwind-codemod migrate [options] <globs...>",
		);
	}
	const options = cli.options as Readonly<Record<string, unknown>>;
	const rawFrom = optionString(options, "from") ?? "auto";
	const rawTo = optionString(options, "to") ?? SwapTargetId.CssClass;
	const fromValue = canonicalIdentifier(rawFrom);
	const toValue = canonicalIdentifier(rawTo);
	const sourceList = rawFrom.includes(",") ? parseSourceList(rawFrom) : [];
	const from = sourceList.length > 0 ? SwapSourceId.Auto : choice("from", fromValue, SWAP_SOURCES);
	const to = MIGRATE_MODES.includes(toValue as MigrateMode)
		? (toValue as MigrateMode)
		: choice("to", toValue, SWAP_TARGETS);
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
	if (safe && partial)
		throw new Error("codemod migrate: --safe and --partial are mutually exclusive");
	return {
		from,
		to,
		...(optionString(options, "root") === undefined ? {} : { root: optionString(options, "root") }),
		dryRun: optionBoolean(options, "dryRun"),
		install: options.install !== false && options.noInstall !== true,
		diff: optionBoolean(options, "diff"),
		report: optionBoolean(options, "report"),
		patterns: [...cli.args],
		metaDir: optionString(options, "meta") ?? "",
		skipMarker: optionString(options, "skipMarker") ?? "pandwind:migrate-skip",
		sources: sourceList,
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
