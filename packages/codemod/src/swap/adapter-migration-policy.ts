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
import { SOURCE_SCANNER_SERVICE, SourceBindingKind, SourceBindings } from "yumcss/source";
import { NodeKind, walkWithParent } from "yumcss/tw/literal";
import { SourcePass } from "../source-pass-utils.ts";

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
	return SourceBindings.fromDocument({ file: "migration.tsx", source }).bindings.some(
		(entry) =>
			entry.localName === binding &&
			(owned.has(entry.source) || matchers.some((matcher) => matcher(entry.source))),
	);
}

export function normalizeSourceCssBinding(
	source: string,
	modules: readonly string[],
	matchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): string {
	const document = SOURCE_SCANNER_SERVICE.scan({ file: "migration.tsx", source });
	if (document.program === undefined) return source;
	const owned = new Set(modules);
	const bindings = SourceBindings.fromProgram(document.program);
	const sourceBinding = bindings.bindings.find(
		(binding) =>
			binding.localName === "css" &&
			(owned.has(binding.source) || matchers.some((matcher) => matcher(binding.source))),
	);
	if (sourceBinding === undefined || bindings.isShadowed("css")) return source;
	const reservedNames = new Set<string>();
	walkWithParent(document.program, (node) => {
		if (node.type === NodeKind.Identifier && typeof node.name === "string")
			reservedNames.add(node.name);
	});
	let renamedBinding = "sourceCss";
	let suffix = 2;
	while (reservedNames.has(renamedBinding)) renamedBinding = "sourceCss" + suffix++;
	const edits: Array<{ readonly start: number; readonly end: number; readonly text: string }> = [
		{
			start: sourceBinding.range.start,
			end: sourceBinding.range.end,
			text:
				sourceBinding.kind === SourceBindingKind.Named
					? sourceBinding.importedName + " as " + renamedBinding
					: sourceBinding.kind === SourceBindingKind.Namespace
						? "* as " + renamedBinding
						: renamedBinding,
		},
	];
	walkWithParent(document.program, (node, parent) => {
		if (
			node.type !== NodeKind.Identifier ||
			node.name !== "css" ||
			typeof node.start !== "number" ||
			typeof node.end !== "number" ||
			(node.start >= sourceBinding.range.start && node.start < sourceBinding.range.end)
		)
			return;
		if (
			parent?.type === NodeKind.MemberExpression &&
			parent.property === node &&
			parent.computed !== true
		)
			return;
		if (parent?.type === NodeKind.Property) {
			if (parent.shorthand === true && parent.value === node) {
				edits.push({ start: node.start, end: node.end, text: "css: " + renamedBinding });
				return;
			}
			if (parent.key === node) return;
		}
		if (parent?.type === NodeKind.ExportSpecifier && parent.local === node) {
			const exported = parent.exported;
			const shorthandExport =
				typeof exported === "object" &&
				exported !== null &&
				"start" in exported &&
				"end" in exported &&
				exported.start === node.start &&
				exported.end === node.end;
			edits.push({
				start: node.start,
				end: node.end,
				text: shorthandExport ? renamedBinding + " as css" : renamedBinding,
			});
			return;
		}
		edits.push({ start: node.start, end: node.end, text: renamedBinding });
	});
	return SourcePass.applyEdits(source, edits);
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
