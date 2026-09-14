import { StyleRepresentationKind, StyleMigrationOutcome } from "./identifiers.ts";
import type { StyleProgram } from "./semantic-ir.ts";
import type {
	AdapterHostFrameworkConversion,
	AdapterTargetMigrationPolicy,
	StyleAdapter,
} from "./adapter-contract.ts";
import type { StyleLoweringPlan, StyleLoweringRegistry } from "./lowering.ts";
import type {
	AdapterMigrationOutcome,
	AdapterMigrationResult,
} from "./adapter-migration-contract.ts";
import type { AdapterFileMigrationResult } from "./adapter-contract.ts";
import type { HostFramework } from "./host-adapters.ts";

/** File-level outcomes keep conservative skips visible to contract gates. */
export function derivedFileOutcomes(
	source: string,
	plans: readonly StyleLoweringPlan[],
): AdapterMigrationOutcome[] {
	return plans.map((plan) => ({
		sourceStart: 0,
		sourceText: source,
		outcome:
			plan.representation === StyleRepresentationKind.Residual
				? StyleMigrationOutcome.Residual
				: StyleMigrationOutcome.TargetNative,
		representation: plan.representation,
	}));
}

function hasAdjacentSkipMarker(source: string, position: number, marker: string): boolean {
	const prefix = source.slice(0, position);
	const lineStart = prefix.lastIndexOf("\n") + 1;
	if (prefix.slice(lineStart).includes(marker)) return true;
	const previousLineEnd = Math.max(0, lineStart - 1);
	const previousLineStart = prefix.lastIndexOf("\n", previousLineEnd - 1) + 1;
	return prefix.slice(previousLineStart, previousLineEnd).includes(marker);
}

export function sourceImportsBinding(
	source: string,
	binding: string,
	modules: readonly string[],
	matchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): boolean {
	const owned = new Set(modules);
	for (const match of source.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu)) {
		const clause = match[1]?.trim() ?? "";
		const moduleSpecifier = match[2];
		if (
			moduleSpecifier === undefined ||
			(!owned.has(moduleSpecifier) && !matchers.some((matcher) => matcher(moduleSpecifier)))
		)
			continue;
		const named = /\{([^}]*)\}/u.exec(clause)?.[1] ?? "";
		if (
			named
				.split(",")
				.map((specifier) =>
					specifier
						.trim()
						.split(/\s+as\s+/u)
						.pop()
						?.trim(),
				)
				.some((local) => local === binding)
		)
			return true;
		const defaultImport = clause.split(",")[0]?.trim();
		if (defaultImport === binding) return true;
	}
	return false;
}

export function sourceImportsModule(
	source: string,
	modules: readonly string[],
	matchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): boolean {
	const owned = new Set(modules);
	return [...source.matchAll(/\bimport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/gu)].some((match) => {
		const moduleSpecifier = match[1];
		return (
			moduleSpecifier !== undefined &&
			(owned.has(moduleSpecifier) || matchers.some((matcher) => matcher(moduleSpecifier)))
		);
	});
}

export function normalizeSourceCssBinding(
	code: string,
	modules: readonly string[],
	matchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): string {
	if (!sourceImportsBinding(code, "css", modules, matchers)) return code;
	const owned = new Set(modules);
	const sourceImport = /\bimport\s+(\{[^}]*\})\s+from\s+["']([^"']+)["']/gu;
	const withSourceAlias = code.replace(
		sourceImport,
		(statement, named: string, moduleSpecifier: string) => {
			if (!owned.has(moduleSpecifier) && !matchers.some((matcher) => matcher(moduleSpecifier)))
				return statement;
			const nextNamed = named.replace(/\bcss\b(?!\s+as)/u, "css as sourceCss");
			return nextNamed === named ? statement : statement.replace(named, nextNamed);
		},
	);
	return withSourceAlias.replace(/\bcss(?=\s*[.(])/gu, "sourceCss");
}

/** Keep an unrelated imported `css` binding from colliding with Pandwind's target binding. */
export function normalizeForeignCssBinding(
	code: string,
	modules: readonly string[],
	matchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
	targetModules: readonly string[] = [],
	targetMatchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): string {
	const owned = new Set(modules);
	const targetOwned = new Set(targetModules);
	let hasForeignCssImport = false;
	const withSourceAlias = code.replace(
		/\bimport\s+(\{[^}]*\})\s+from\s+["']([^"']+)["']/gu,
		(statement, named: string, moduleSpecifier: string) => {
			if (
				targetOwned.has(moduleSpecifier) ||
				targetMatchers.some((matcher) => matcher(moduleSpecifier)) ||
				owned.has(moduleSpecifier) ||
				matchers.some((matcher) => matcher(moduleSpecifier))
			)
				return statement;
			const nextNamed = named.replace(/\bcss(?:\s+as\s+css)?[ \t]*(?=,|\})/u, "css as sourceCss");
			if (nextNamed === named) return statement;
			hasForeignCssImport = true;
			return statement.replace(named, nextNamed);
		},
	);
	return hasForeignCssImport ? withSourceAlias.replace(/\bcss(?=\s*[.(])/gu, "sourceCss") : code;
}

export function withoutDuplicateSkipMarkers(
	source: string,
	edits: readonly { readonly start: number; readonly end: number; readonly text: string }[],
	marker: string,
): readonly { readonly start: number; readonly end: number; readonly text: string }[] {
	return edits.filter(
		(edit) =>
			!(edit.start === edit.end && edit.text.includes(marker)) ||
			!hasAdjacentSkipMarker(source, edit.start, marker),
	);
}

export function hasTargetHostPort(adapter: StyleAdapter): boolean {
	return adapter.migration?.targetPolicy?.handlesHostRewrites === true;
}

export function hostFrameworkConversion(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): AdapterHostFrameworkConversion | undefined {
	if (sourceFramework === undefined) return undefined;
	return policy?.hostFrameworkConversions?.find(
		(candidate) =>
			candidate.from === sourceFramework &&
			(candidate.canConvert === undefined || candidate.canConvert(context)),
	);
}

export function targetHostFramework(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): HostFramework | undefined {
	if (sourceFramework === undefined) return undefined;
	if (policy?.hostFrameworks?.includes(sourceFramework)) return sourceFramework;
	if (policy?.hostFrameworks === undefined && policy?.hostFrameworkConversions === undefined)
		return sourceFramework;
	const conversion = hostFrameworkConversion(policy, sourceFramework, context);
	return conversion?.to ?? sourceFramework;
}

export function targetAcceptsSourceFramework(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): boolean {
	if (sourceFramework === undefined) return false;
	if (policy?.hostFrameworks?.includes(sourceFramework)) return true;
	if (policy?.hostFrameworks === undefined && policy?.hostFrameworkConversions === undefined)
		return true;
	return hostFrameworkConversion(policy, sourceFramework, context) !== undefined;
}

export function loweringRegistryForRoute(
	base: StyleLoweringRegistry,
	source: StyleAdapter,
	target: StyleAdapter,
): StyleLoweringRegistry {
	const byId = new Map<string, NonNullable<StyleAdapter["lowerings"]>[number]>();
	for (const lowering of [...(source.lowerings ?? []), ...(target.lowerings ?? [])])
		byId.set(lowering.id, lowering);
	return byId.size === 0 ? base : base.extend([...byId.values()]);
}

export function normalizeAsyncMigrationResult(
	source: string,
	result: AdapterFileMigrationResult,
): AdapterMigrationResult {
	return {
		...result,
		fileChanges: result.fileChanges ?? [],
		...(result.sourceMaps === undefined ? {} : { sourceMaps: result.sourceMaps }),
		reports: [],
		validations: result.validations ?? [],
		loweringPlans: result.loweringPlans,
		outcomes: result.outcomes ?? derivedFileOutcomes(source, result.loweringPlans),
	};
}
