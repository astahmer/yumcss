import type {
	AdapterComponentRewriteResult,
	AdapterMigrationHooks,
	AdapterTargetMigrationPolicy,
} from "./adapter-contract.ts";
import { getHostComponentRewriter } from "./host-component-rewriter.ts";
import { StyleHostRepresentationKind } from "./identifiers.ts";

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
