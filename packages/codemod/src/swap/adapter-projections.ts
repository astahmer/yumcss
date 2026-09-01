import type {
	AdapterComponentRewriteResult,
	AdapterMigrationHooks,
	AdapterTargetMigrationPolicy,
} from "./adapter-contract.ts";
import type { AdapterCapability } from "./capabilities.ts";
import { BuiltinHostFramework } from "./host-adapters.ts";
import { DynamicClassHost } from "./adapters/class-target-dynamic.ts";
import { getHostComponentRewriter } from "./host-component-rewriter.ts";
import { StyleHostRepresentationKind, StyleRepresentationKind } from "./identifiers.ts";

/**
 * Preserve a static styled intrinsic on targets whose normal carrier is a
 * class. The declaration keeps the target class expression and the host use
 * becomes the original intrinsic element with that class. This belongs at the
 * adapter-factory boundary so every class-valued adapter gets the same safe
 * projection, regardless of which concrete adapter factory constructs it.
 */
function projectStaticSubjectToClass(
	policy: AdapterTargetMigrationPolicy | undefined,
): AdapterTargetMigrationPolicy | undefined {
	if (
		policy === undefined ||
		policy.handlesHostRewrites !== true ||
		policy.hostRepresentation !== StyleHostRepresentationKind.Class ||
		policy.rewriteComponent !== undefined
	)
		return policy;

	return {
		...policy,
		rewriteComponent: (context): AdapterComponentRewriteResult => {
			const rewriter = getHostComponentRewriter(context.framework);
			if (rewriter === undefined)
				return {
					code: context.code,
					imports: [],
					residuals: [
						{
							kind: "host-framework",
							text: context.binding,
							hint: `${context.targetId} has no host component rewriter for ${context.framework}`,
						},
					],
				};

			return rewriter.rewrite({
				// Component rewrites run after the style expression replacement;
				// use the current code so nested edits cannot target stale offsets.
				source: context.code,
				file: context.file,
				binding: context.binding,
				tag: context.tag,
				framework: context.framework,
				// The declaration owns the target carrier. Reuse its binding at the
				// host site instead of duplicating the emitted style expression.
				classExpression: context.binding,
			});
		},
	};
}

export function projectStaticSubjectMigration(
	migration: AdapterMigrationHooks | undefined,
): AdapterMigrationHooks | undefined {
	const policy = projectStaticSubjectToClass(migration?.targetPolicy);
	if (migration === undefined && policy === undefined) return undefined;
	return { ...migration, ...(policy === undefined ? {} : { targetPolicy: policy }) };
}

/**
 * Compose the shared static custom-property carrier for class-valued targets.
 * This is deliberately opt-in: a class API must prove that `var(...)` values
 * survive its own emitter before it can advertise this representation.
 */
export function projectDynamicClassMigration(
	targetId: string,
	migration: AdapterMigrationHooks | undefined,
): AdapterMigrationHooks | undefined {
	const policy = migration?.targetPolicy;
	if (
		policy === undefined ||
		policy.dynamicClassCarrier !== true ||
		policy.handlesHostRewrites !== true ||
		policy.hostRepresentation !== StyleHostRepresentationKind.Class
	)
		return migration;

	const resolveRepresentation = policy.resolveRepresentation;
	const capabilitiesForRepresentation = policy.capabilitiesForRepresentation;
	const preservesResidualKinds = policy.preservesResidualKindsForRepresentation;
	const rewriteHost = policy.rewriteHost;
	const composed: AdapterTargetMigrationPolicy = {
		...policy,
		resolveRepresentation: (context) => {
			const selected = resolveRepresentation?.(context);
			if (selected !== undefined) return selected;
			if (
				!context.hasHostContext ||
				context.binding === undefined ||
				(context.framework !== undefined &&
					![BuiltinHostFramework.React, BuiltinHostFramework.Preact].includes(
						context.framework as BuiltinHostFramework,
					)) ||
				!DynamicClassHost.hasCarrier(context.program) ||
				!DynamicClassHost.canRewrite(context.source ?? "", context.binding)
			)
				return undefined;
			return StyleRepresentationKind.CustomProperty;
		},
		capabilitiesForRepresentation: (context) => {
			const capabilities = capabilitiesForRepresentation?.(context) ?? [];
			return context.representation === StyleRepresentationKind.CustomProperty
				? [
						...new Set<AdapterCapability>([
							...capabilities,
							"custom-properties",
							// The source host evaluates the expression while binding the
							// variable; the target does not need its own theme API.
							"theme-context",
						]),
					]
				: capabilities;
		},
		preservesResidualKindsForRepresentation: (context) => {
			const residuals = preservesResidualKinds?.(context) ?? [];
			return context.representation === StyleRepresentationKind.CustomProperty
				? [...new Set([...residuals, "dynamic-custom-property"])]
				: residuals;
		},
		rewriteHost: (context) => {
			if (context.representationKind !== StyleRepresentationKind.CustomProperty)
				return rewriteHost?.(context) ?? { code: context.code, residuals: [] };
			return DynamicClassHost.rewrite(targetId, context.code, {
				binding: context.binding,
				framework: context.framework,
				representationKind: context.representationKind,
				residuals: context.residuals,
			});
		},
	};
	return { ...migration, targetPolicy: composed };
}
