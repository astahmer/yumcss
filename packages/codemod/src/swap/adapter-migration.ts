import { readFileSync } from "node:fs";
import { applyEdits } from "../migrate.ts";
import { ensureImport } from "../shared.ts";
import { createSourceScannerRegistry } from "pandwind/source";
import type { PandwindMeta } from "../meta.ts";
import {
	inspectAdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	AdapterDependencies,
	AdapterParseContext,
	AdapterValidationResult,
} from "./adapter-contract.ts";
import { styleProgramFromRules, type StyleProgramResidual } from "./semantic-ir.ts";
import { STYLE_LOWERING_REGISTRY, type StyleLoweringRegistry } from "./lowering.ts";
import type { StyleSystemRegistry } from "./style-systems.ts";
import {
	EXTERNAL_ADAPTER_REGISTRY,
	consolidateImports,
	removeSourceImports,
	validationSource,
} from "./external-adapters.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";

export interface AdapterMigrationOptions {
	readonly from: string;
	readonly to: string;
	readonly file: string;
	readonly root?: string;
	readonly meta?: PandwindMeta;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	readonly readFile?: (file: string) => string | undefined;
	readonly mode?: AdapterCapabilityMode;
	readonly skipMarker?: string;
	/** Optional registry for third-party or core dialect routes. */
	readonly registry?: StyleSystemRegistry;
	/** Optional adapter registry, including adapters discovered from plugins. */
	readonly adapterRegistry?: StyleAdapterRegistry;
	/** Optional target-aware semantic lowering registry. */
	readonly loweringRegistry?: StyleLoweringRegistry;
	/** Framework/project metadata that cannot be recovered from syntax alone. */
	readonly semantic?: AdapterParseContext["semantic"];
}

export interface AdapterMigrationResult {
	readonly code: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly reports: readonly AdapterCapabilityReport[];
	readonly validations: readonly AdapterValidationResult[];
	readonly dependencies: readonly AdapterDependencies[];
	readonly residuals: readonly StyleProgramResidual[];
}

/** Run one v2 adapter-to-adapter migration over a source file. */
export function runAdapterMigration(
	source: string,
	options: AdapterMigrationOptions,
): AdapterMigrationResult {
	const adapterRegistry = options.adapterRegistry ?? EXTERNAL_ADAPTER_REGISTRY;
	const route = (options.registry ?? adapterRegistry.toStyleSystemRegistry()).resolveRoute(
		options.from,
		options.to,
	);
	const sourceAdapter = route.source;
	const targetAdapter = route.target;
	const detection = sourceAdapter.detect({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
	});
	if (!detection.matched) {
		return {
			code: source,
			changed: false,
			converted: 0,
			skipped: 0,
			reports: [],
			validations: [],
			dependencies: [],
			residuals: [],
		};
	}
	const readFile =
		options.readFile ??
		((file: string) => {
			try {
				return readFileSync(file, "utf8");
			} catch {
				return undefined;
			}
		});
	const config = sourceAdapter.loadConfig({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	});
	const targetConfig = targetAdapter.loadConfig({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	});
	const document = createSourceScannerRegistry().scan({
		file: options.file,
		source,
		root: options.root,
	});
	const parsed = sourceAdapter.parse(source, {
		file: options.file,
		source,
		root: options.root,
		config,
		meta: options.meta,
		document,
		semantic: options.semantic,
	});
	const mode = options.mode ?? "safe";
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const imports = new Set<string>();
	const reports: AdapterCapabilityReport[] = [];
	const validations: AdapterValidationResult[] = [];
	const dependencies: AdapterDependencies[] = [targetAdapter.dependencies];
	const residuals: StyleProgramResidual[] = [...parsed.residuals];
	let skipped = 0;
	for (const [index, match] of parsed.matches.entries()) {
		const lowering = (options.loweringRegistry ?? STYLE_LOWERING_REGISTRY).lower({
			program: match.program,
			target: targetAdapter.capabilities,
			mode,
		});
		const program = lowering.program;
		const report = inspectAdapterCapabilities(targetAdapter.capabilities, program, mode);
		reports.push(report);
		const hasParseResiduals = program.residuals.length > 0 || lowering.residuals.length > 0;
		if (!report.convertible || (mode === "safe" && hasParseResiduals)) {
			skipped++;
			residuals.push(
				...program.residuals,
				...(report.blockers.length === 0
					? []
					: [
							{
								kind: "capability",
								text: match.sourceText,
								hint: report.blockers
									.map((issue) => `${issue.capability}: ${issue.detail}`)
									.join("; "),
							},
						]),
				...lowering.residuals,
			);
			edits.push({
				start: match.start,
				end: match.start,
				text: `// ${marker} (adapter capability mismatch)\n`,
			});
			continue;
		}
		residuals.push(...lowering.residuals);
		const emitted = targetAdapter.emit(program, {
			file: options.file,
			config: targetConfig,
			mode,
			capability: report,
			index,
			document,
			meta: options.meta,
		});
		for (const statement of emitted.imports ?? []) imports.add(statement);
		if (emitted.dependencies !== undefined) dependencies.push(emitted.dependencies);
		residuals.push(...emitted.residuals);
		const emittedForValidation = validationSource(emitted.text, program);
		const reparsed = targetAdapter.parse(emittedForValidation, {
			file: options.file,
			source: emittedForValidation,
			root: options.root,
			config: targetAdapter.loadConfig({
				file: options.file,
				source: emitted.text,
				root: options.root,
				packageJson: options.packageJson,
				readFile,
			}),
			meta: options.meta,
			document,
			semantic: options.semantic,
		});
		const targetProgram =
			reparsed.matches.length === 0
				? program
				: styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: program.source,
							residuals: reparsed.residuals,
						},
					);
		const validation = targetAdapter.validate(program, targetProgram, [
			...emitted.residuals,
			...reparsed.residuals,
		]);
		validations.push(validation);
		edits.push({ start: match.start, end: match.end, text: emitted.text });
	}
	let code = removeSourceImports(applyEdits(source, edits), sourceAdapter.sourceModules);
	for (const statement of consolidateImports(imports)) code = ensureImport(code, statement);
	return {
		code,
		changed: code !== source,
		converted: parsed.matches.length - skipped,
		skipped,
		reports,
		validations,
		dependencies,
		residuals,
	};
}
