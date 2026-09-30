import type { ProjectModuleLoader } from "./project-module-loader.ts";
import {
	migrationCommentStyleForFile,
	migrationSkipMarker,
	type MigrationCommentStyle,
} from "./migration-diagnostics.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	StyleAdapter,
} from "./adapter-contract.ts";
import type {
	AdapterMigrationOptions,
	AdapterMigrationPorts,
	AdapterMigrationResult,
} from "./adapter-migration-contract.ts";
import {
	STYLE_PROGRAM_SCHEMA,
	StyleProgramResidualKindTag,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { StyleProgramCore } from "./style-program-core.ts";
import { StyleMigrationOutcome, StyleRepresentationKind } from "./identifiers.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";

export interface PreparedAdapterMigration {
	readonly sourceAdapter: StyleAdapter;
	readonly targetAdapter: StyleAdapter;
	readonly context: AdapterConfigContext;
	readonly sourceConfig: AdapterProjectConfig;
	readonly targetConfig: AdapterProjectConfig;
}

type PreparationResult = PreparedAdapterMigration | AdapterMigrationResult;

function migrationContext(source: string, options: AdapterMigrationOptions): AdapterConfigContext {
	return {
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile: options.readFile,
		listFiles: options.listFiles,
	};
}

function noOpMigration(source: string): AdapterMigrationResult {
	return {
		code: source,
		changed: false,
		converted: 0,
		skipped: 0,
		reports: [],
		validations: [],
		dependencies: [],
		generatedFiles: [],
		fileChanges: [],
		residuals: [],
		loweringPlans: [],
		outcomes: [],
	};
}

function configurationResult(
	source: string,
	residuals: readonly StyleProgramResidual[],
	marker: string,
	detail: string,
	commentStyle: MigrationCommentStyle,
): AdapterMigrationResult {
	const code =
		migrationSkipMarker({ marker, configurationResiduals: residuals }, commentStyle) +
		"\n" +
		source;
	return {
		code,
		changed: code !== source,
		converted: 0,
		skipped: 1,
		reports: [],
		validations: [],
		dependencies: [],
		generatedFiles: [],
		fileChanges: [],
		residuals,
		loweringPlans: [],
		outcomes: [
			{
				sourceStart: 0,
				sourceText: source,
				outcome: StyleMigrationOutcome.Residual,
				representation: StyleRepresentationKind.Residual,
				detail,
			},
		],
	};
}

function configurationFailure(
	source: string,
	detail: string,
	marker = "pandwind:migrate-skip",
	commentStyle: MigrationCommentStyle = "line",
): AdapterMigrationResult {
	return configurationResult(
		source,
		[
			{
				kind: StyleProgramResidualKindTag.Configuration,
				text: "official project configuration",
				hint: `official adapter configuration loading failed: ${detail}`,
			},
		],
		marker,
		"official project configuration could not be loaded",
		commentStyle,
	);
}

function configurationResiduals(
	source: string,
	residuals: readonly StyleProgramResidual[],
	marker: string,
	commentStyle: MigrationCommentStyle,
): AdapterMigrationResult {
	return configurationResult(
		source,
		residuals,
		marker,
		"official project configuration could not be loaded",
		commentStyle,
	);
}

async function withProjectLoaderFallback(
	fallback: ProjectModuleLoader,
): Promise<ProjectModuleLoader> {
	// Keep the Node loader out of the synchronous/browser migration graph. The
	// async path is the only path that consults project-installed packages.
	const { NODE_PROJECT_MODULE_LOADER } = await import(
		/* @vite-ignore */ "./project-module-loader.js"
	);
	return {
		async importPackage<T>(packageName: string, root: string): Promise<T | undefined> {
			return (
				(await NODE_PROJECT_MODULE_LOADER.importPackage<T>(packageName, root)) ??
				(await fallback.importPackage<T>(packageName, root))
			);
		},
		importFile<T>(file: string): Promise<T | undefined> {
			return NODE_PROJECT_MODULE_LOADER.importFile<T>(file).then(
				(loaded) => loaded ?? fallback.importFile<T>(file),
			);
		},
	};
}

function registryFor(
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
): StyleAdapterRegistry {
	return options.adapterRegistry ?? ports.adapterRegistry;
}

function prepareResolvedMigration(
	source: string,
	options: AdapterMigrationOptions,
	route: ReturnType<StyleAdapterRegistry["resolveRoute"]>,
	context: AdapterConfigContext,
	configs: { readonly source: AdapterProjectConfig; readonly target: AdapterProjectConfig },
): PreparationResult {
	const residuals = [...(configs.source.residuals ?? []), ...(configs.target.residuals ?? [])];
	if (residuals.length > 0)
		return configurationResiduals(
			source,
			residuals,
			options.skipMarker ?? "pandwind:migrate-skip",
			migrationCommentStyleForFile(options.file),
		);
	return {
		sourceAdapter: route.source,
		targetAdapter: route.target,
		context,
		sourceConfig: configs.source,
		targetConfig: configs.target,
	};
}

const sourceProgramsForTargetConfig = (
	source: string,
	context: AdapterConfigContext,
	route: ReturnType<StyleAdapterRegistry["resolveRoute"]>,
	sourceConfig: AdapterProjectConfig,
): readonly StyleProgram[] => {
	const sourceOwnership = route.source.resolveSourceModuleOwnership?.(sourceConfig) ?? {
		modules: route.source.sourceModules,
		...(route.source.sourceModuleMatchers === undefined
			? {}
			: { matchers: route.source.sourceModuleMatchers }),
	};
	const parsed = route.source.parse(source, {
		...context,
		config: sourceConfig,
		targetId: route.target.id,
		sourceModules: sourceOwnership.modules,
		...(sourceOwnership.matchers === undefined
			? {}
			: { sourceModuleMatchers: sourceOwnership.matchers }),
		...(sourceOwnership.semanticMatchers === undefined
			? {}
			: { sourceModuleSemanticMatchers: sourceOwnership.semanticMatchers }),
	});
	const programs: StyleProgram[] = [];
	for (const { program } of parsed.matches) {
		if (program.schema !== STYLE_PROGRAM_SCHEMA) continue;
		programs.push(StyleProgramCore.normalize(program));
	}
	return programs;
};

export function prepareMigration(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
): PreparationResult {
	const adapterRegistry = registryFor(options, ports);
	const route = (options.registry ?? adapterRegistry).resolveRoute(options.from, options.to);
	if (route.source.id === route.target.id) return noOpMigration(source);
	const context = migrationContext(source, options);
	if (!route.source.detect(context).matched) return noOpMigration(source);
	return prepareResolvedMigration(source, options, route, context, {
		source: route.source.loadConfig(context),
		target: route.target.loadConfig(context),
	});
}

export async function prepareMigrationAsync(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
): Promise<PreparationResult> {
	const adapterRegistry =
		options.adapterRegistry ??
		(await ports.resolveAdapterRegistry?.(
			options.moduleLoader === undefined
				? undefined
				: await withProjectLoaderFallback(options.moduleLoader),
		)) ??
		ports.adapterRegistry;
	const route = (options.registry ?? adapterRegistry).resolveRoute(options.from, options.to);
	if (route.source.id === route.target.id) return noOpMigration(source);
	const context = migrationContext(source, options);
	if (!route.source.detect(context).matched) return noOpMigration(source);
	try {
		if (
			route.target.configRequiresSourcePrograms === true &&
			route.target.loadConfigAsync !== undefined
		) {
			const sourceConfig =
				(await route.source.loadConfigAsync?.(context)) ?? route.source.loadConfig(context);
			const targetConfig = await route.target.loadConfigAsync({
				...context,
				stylePrograms: sourceProgramsForTargetConfig(source, context, route, sourceConfig),
			});
			return prepareResolvedMigration(source, options, route, context, {
				source: sourceConfig,
				target: targetConfig,
			});
		}
		const [sourceConfig, targetConfig] = await Promise.all([
			route.source.loadConfigAsync?.(context) ?? route.source.loadConfig(context),
			route.target.loadConfigAsync?.(context) ?? route.target.loadConfig(context),
		]);
		return prepareResolvedMigration(source, options, route, context, {
			source: sourceConfig,
			target: targetConfig,
		});
	} catch (error) {
		return configurationFailure(
			source,
			error instanceof Error ? error.message : String(error),
			options.skipMarker,
			migrationCommentStyleForFile(options.file),
		);
	}
}

export function isMigrationResult(value: PreparationResult): value is AdapterMigrationResult {
	return "code" in value;
}
