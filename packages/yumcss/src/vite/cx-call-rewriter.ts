import { bindingIsShadowedInAncestors } from "./css-literal-scope.ts";
import { walkWithParent } from "../tw/literal.ts";
import { toOxcNode } from "../oxc-node.ts";
import type { Expression } from "oxc-parser";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { createCx, type CxInput } from "../cx/index.ts";
import { ATOM_REGISTRY } from "../css/atoms.ts";
import type { CssFn } from "../css/create-css.ts";
import type { OxcNode } from "../tw/literal.ts";
import { OnUnresolvedTag, type TwConfig, type OnUnresolved } from "./inline.ts";
import { createLineIndex, collectUnresolvedTokens, type UnresolvedToken } from "./unresolved.ts";
import { tokenHasExactCss } from "./unresolved.ts";
import {
	buildFoldSkeleton,
	classMapMember,
	collectModuleConstants,
	containsLateObjectMemberRead,
	CX_NOT_STATIC,
	evalStaticCx,
	mergeImportedConstants,
	renderFoldSkeletons,
	renderFoldSkeleton,
	type ConstantScope,
	type CxFoldContext,
	type FoldSkeleton,
	type KnownConstant,
	type StaticEval,
} from "./cx-static-evaluator.ts";
import { NodeKind } from "../ast-node-kind.ts";
import { applySourceEdits } from "./source-edits.ts";

/** Rewrites only provably equivalent cx() calls; all other calls stay runtime. */
export interface CxCompilerPorts {
	readonly collectConstants: (program: OxcNode, fold?: CxFoldContext) => ConstantScope;
	readonly evaluate: (
		node: Expression | undefined,
		fold?: CxFoldContext,
		constants?: ConstantScope,
	) => StaticEval;
	readonly buildSkeleton: (
		node: Expression,
		constants: ConstantScope,
		code: string,
	) => import("./cx-static-evaluator.ts").FoldSkeleton | null;
	readonly renderSkeleton: typeof renderFoldSkeleton;
	readonly renderSkeletons?: typeof renderFoldSkeletons;
	readonly mergeConstants: typeof mergeImportedConstants;
}

export const defaultCxCompilerPorts: CxCompilerPorts = {
	collectConstants: collectModuleConstants,
	evaluate: evalStaticCx,
	buildSkeleton: buildFoldSkeleton,
	renderSkeleton: renderFoldSkeleton,
	renderSkeletons: renderFoldSkeletons,
	mergeConstants: mergeImportedConstants,
};

const MAX_PARTIAL_FOLD_CASES = 16;

const foldSkeletonCaseCount = (skeleton: FoldSkeleton): number => {
	if (skeleton.kind === "leaf") return 1;
	if (skeleton.kind === "cond")
		return Math.min(
			MAX_PARTIAL_FOLD_CASES + 1,
			foldSkeletonCaseCount(skeleton.consequent) + foldSkeletonCaseCount(skeleton.alternate),
		);
	return Math.min(MAX_PARTIAL_FOLD_CASES + 1, 1 + foldSkeletonCaseCount(skeleton.right));
};

const buildPartialFoldSkeleton = (options: {
	readonly node: Expression;
	readonly constants: ConstantScope;
	readonly code: string;
	readonly buildSkeleton?: CxCompilerPorts["buildSkeleton"];
}): FoldSkeleton | null => {
	const type = (options.node as { type?: string }).type;
	if (type !== NodeKind.ConditionalExpression && type !== NodeKind.LogicalExpression) return null;
	return (options.buildSkeleton ?? buildFoldSkeleton)(
		options.node,
		options.constants,
		options.code,
	);
};

export interface CxCompilerOptions {
	/** Cross-module constants already resolved by the module-graph port. */
	readonly importedConstants?: ConstantScope;
	/** Enables literal css()/css.class() folding through the shared engine. */
	readonly fold?: CxFoldContext;
	/** Disable constant propagation only for coverage/comparison harnesses. */
	readonly constants?: boolean;
	/** Replace bounded dynamic conditionals with decisions over premerged strings. */
	readonly partialFold?: boolean;
	readonly onUnresolved?: OnUnresolved;
	/** Reuse a program parsed by import discovery or a preceding fold pass. */
	readonly parsedProgram?: OxcNode;
}

export interface CxRewriteResult {
	readonly code: string;
	readonly inlined: number;
	readonly unresolved?: UnresolvedToken[];
	/**
	 * Class tokens that unfolded cx() calls may produce at runtime from
	 * finite dynamic arguments (ternaries, unions, constant sets). The host
	 * registers them with the Tailwind scanner so runtime-selected classes
	 * still have CSS. Only design-system-verified tokens are registered;
	 * foreign classes stay runtime-only.
	 */
	readonly candidates?: string[];
}

interface CallNode extends OxcNode {
	type: typeof NodeKind.CallExpression;
	start: number;
	end: number;
	callee: { type?: string; name?: string } | null;
	arguments: Expression[];
}

/**
 * Class candidates for one unfolded cx() call, walking the cx input grammar
 * conservatively. Record keys register regardless of their values' staticity
 * (truthiness is a runtime decision; a key is a possible class either way).
 * Conditionals and logical operators union their branches; arrays union
 * their elements; known constants resolve to their values. Calls,
 * templates with expressions, spreads of unknown arrays, and anything else
 * unbounded contribute nothing — they stay runtime-only rather than guessing.
 */
export const collectCxClassCandidates = (
	root: Expression,
	consts: Map<string, unknown>,
): string[] => {
	const found = new Set<string>();
	const visited = new Set<unknown>();
	const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
	while (stack.length > 0) {
		const { node, depth } = stack.pop()!;
		if (depth > 16 || node === null || typeof node !== "object" || visited.has(node)) continue;
		visited.add(node);
		switch ((node as { type?: string }).type) {
			case NodeKind.Literal: {
				const value = (node as { value?: unknown }).value;
				if (typeof value === "string" && value !== "") found.add(value);
				break;
			}
			case NodeKind.Identifier: {
				const known = consts.get((node as { name?: string }).name ?? "");
				if (known !== undefined) stack.push({ node: known, depth: depth + 1 });
				break;
			}
			case NodeKind.ConditionalExpression: {
				const conditional = node as { consequent: unknown; alternate: unknown };
				stack.push({ node: conditional.consequent, depth: depth + 1 });
				stack.push({ node: conditional.alternate, depth: depth + 1 });
				break;
			}
			case NodeKind.LogicalExpression: {
				const logical = node as { left: unknown; right: unknown };
				// Both sides are possible results (|| / ??) or the right side
				// is (&&); visiting left too is a conservative superset.
				stack.push({ node: logical.left, depth: depth + 1 });
				stack.push({ node: logical.right, depth: depth + 1 });
				break;
			}
			case NodeKind.ArrayExpression: {
				for (const element of (node as { elements: unknown[] }).elements) {
					if (element !== null) stack.push({ node: element, depth: depth + 1 });
				}
				break;
			}
			case NodeKind.ObjectExpression: {
				for (const property of (node as { properties: unknown[] }).properties) {
					const prop = property as {
						type?: string;
						computed?: boolean;
						key?: { type?: string; name?: string; value?: unknown };
					};
					if (prop.type !== NodeKind.Property || prop.computed) continue;
					const key = prop.key;
					const name =
						key?.type === NodeKind.Identifier
							? key.name
							: key?.type === NodeKind.Literal && typeof key.value === "string"
								? key.value
								: undefined;
					if (name !== undefined && name !== "") found.add(name);
				}
				break;
			}
			default:
				break;
		}
	}
	return [...found];
};

/**
 * Register a class only when every token compiles through the design system.
 * Tokens that fail exact-match verification are appended to `unresolved` with
 * the call-site line when provided, so dynamic values never vanish silently —
 * they stay on the runtime path and surface in diagnostics/scan reports.
 */
export const pushVerifiedCandidate = (
	candidate: string,
	config: TwConfig,
	out: string[],
	unresolved?: UnresolvedToken[],
	line?: number,
): boolean => {
	let verified = true;
	for (const token of candidate.split(/\s+/)) {
		if (token === "") continue;
		if (!tokenHasExactCss(token, config)) {
			verified = false;
			unresolved?.push({ token, line: line ?? 0, reason: "no-css" });
		}
	}
	if (verified) out.push(candidate);
	return verified;
};

export class CxCallRewriter {
	private readonly ports: CxCompilerPorts;

	constructor(ports: CxCompilerPorts = defaultCxCompilerPorts) {
		this.ports = ports;
	}

	rewrite(
		code: string,
		id: string,
		config: TwConfig,
		cxNames: ReadonlySet<string>,
		options: CxCompilerOptions = {},
	): CxRewriteResult {
		const fold = options.fold;
		if (cxNames.size === 0 && fold === undefined) return { code, inlined: 0 };
		const program =
			options.parsedProgram ??
			toOxcNode(SOURCE_SCANNER_SERVICE.parse({ file: id, source: code }).program);
		const constants =
			options.constants === false
				? new Map<string, KnownConstant>()
				: this.ports.mergeConstants(
						program,
						this.ports.collectConstants(program, fold),
						options.importedConstants,
					);
		const evaluate = createCx({
			conflicts: config.conflicts,
			compose: config.compose,
			directionalConflicts: config.directionalConflicts,
			...(fold === undefined
				? {}
				: {
						// SAFETY: createCx reads only ATOM_REGISTRY from this compiler-only carrier.
						css: { [ATOM_REGISTRY]: fold.engine.registry } as unknown as CssFn<never>,
					}),
		});
		const merge = (inputs: CxInput[]): string | undefined => {
			try {
				return evaluate(...inputs);
			} catch {
				return undefined;
			}
		};
		const edits: Array<{ start: number; end: number; text: string }> = [];
		const unresolved: UnresolvedToken[] = [];
		const lines =
			options.onUnresolved !== undefined && options.onUnresolved !== OnUnresolvedTag.Off
				? createLineIndex(code)
				: undefined;
		const callLines = lines ? lines.lineOf(0) : 0;
		let candidates: string[] | undefined;
		const partial = options.partialFold !== false;
		const rawConsts = new Map([...constants].map(([name, known]) => [name, known.value] as const));
		// Register the finite class union of a call that stays runtime so the
		// Tailwind scanner can emit CSS for classes that never appear as
		// static source text. Used on both abandonment paths below.
		const registerCallCandidates = (call: { arguments: readonly Expression[]; start?: number }) => {
			for (const argument of call.arguments) {
				for (const candidate of collectCxClassCandidates(argument, rawConsts))
					pushVerifiedCandidate(
						candidate,
						config,
						(candidates ??= []),
						unresolved,
						call.start !== undefined && lines ? lines.lineOf(call.start) : callLines,
					);
			}
		};

		walkWithParent(program, (node, _parent, ancestors) => {
			if (node.type !== NodeKind.CallExpression) return;
			const call = node as CallNode;
			if (bindingIsShadowedInAncestors(call.callee?.name ?? "", ancestors)) return;
			if (call.callee?.type !== NodeKind.Identifier || !cxNames.has(call.callee.name ?? "")) return;
			const scopedFold =
				fold === undefined ||
				![...fold.cssNames].some((name) => bindingIsShadowedInAncestors(name, ancestors))
					? fold
					: {
							...fold,
							cssNames: new Set(
								[...fold.cssNames].filter((name) => !bindingIsShadowedInAncestors(name, ancestors)),
							),
						};
			const inputs: StaticEval[] = [];
			const conditionals: Array<{ index: number; skeleton: FoldSkeleton }> = [];
			const classMapReads: Array<{
				readonly argument: Expression;
				readonly value: string;
				readonly late: boolean;
			}> = [];
			let mergedValue: string | undefined;
			let partialCases = 1;
			for (let index = 0; index < call.arguments.length; index++) {
				const argument = call.arguments[index]!;
				const hasLateMemberRead = containsLateObjectMemberRead(argument, constants);
				const mapMember = classMapMember(argument, constants);
				const isDirectLateMemberRead =
					mapMember !== undefined &&
					typeof argument.start === "number" &&
					argument.start < mapMember.declStart;
				if (
					hasLateMemberRead &&
					(mapMember === undefined || !isDirectLateMemberRead || conditionals.length > 0)
				) {
					registerCallCandidates(call);
					return;
				}

				const value = this.ports.evaluate(argument, scopedFold, constants);
				if (value !== CX_NOT_STATIC) {
					inputs.push(value);
					if (mapMember !== undefined)
						classMapReads.push({ argument, value: mapMember.value, late: isDirectLateMemberRead });
					continue;
				}
				const skeleton = partial
					? buildPartialFoldSkeleton({
							node: argument,
							constants,
							code,
							buildSkeleton: this.ports.buildSkeleton,
						})
					: null;
				if (skeleton !== null) {
					const cases = foldSkeletonCaseCount(skeleton);
					if (cases <= MAX_PARTIAL_FOLD_CASES && partialCases * cases <= MAX_PARTIAL_FOLD_CASES) {
						if (classMapReads.some((read) => read.late)) {
							registerCallCandidates(call);
							return;
						}
						conditionals.push({ index, skeleton });
						partialCases *= cases;
						inputs.push(CX_NOT_STATIC);
						continue;
					}
				}
				// Unknown helpers, spreads, and additional dynamic arguments are
				// left intact so runtime evaluation retains its original semantics.
				registerCallCandidates(call);
				return;
			}
			let replacement: string | null = null;
			if (conditionals.length === 0) {
				const merged = merge(inputs as CxInput[]);
				if (merged !== undefined) {
					mergedValue = merged;
					replacement = JSON.stringify(merged);
					if (lines !== undefined)
						unresolved.push(...collectUnresolvedTokens(merged, lines.lineOf(call.start), config));
				}
			} else if (conditionals.length === 1) {
				// The emitted branches are each merged with the static siblings;
				// only the original condition remains in application code.
				replacement = this.ports.renderSkeleton(
					conditionals[0]!.skeleton,
					conditionals[0]!.index,
					inputs,
					merge,
				);
			} else {
				replacement = (this.ports.renderSkeletons ?? renderFoldSkeletons)(
					conditionals,
					inputs,
					merge,
				);
			}
			if (replacement !== null && classMapReads.length > 0 && conditionals.length === 0) {
				const everyArgumentIsClassMapMember = classMapReads.length === call.arguments.length;
				const rawClassList = classMapReads.map(({ value }) => value).join(" ");
				const originalLength = call.end - call.start;
				const sourceMemberExpression = classMapReads
					.map(({ argument }) => code.slice(argument.start, argument.end))
					.join('+" "+');
				if (
					everyArgumentIsClassMapMember &&
					mergedValue === rawClassList &&
					sourceMemberExpression.length <= originalLength
				) {
					replacement = sourceMemberExpression;
				} else if (classMapReads.some((read) => read.late)) {
					replacement = null;
				}
			}
			if (replacement !== null) edits.push({ start: call.start, end: call.end, text: replacement });
			else {
				registerCallCandidates(call);
			}
		});

		const output = applySourceEdits(code, edits);
		if (edits.length === 0)
			return {
				code,
				inlined: 0,
				...(unresolved.length > 0 && { unresolved }),
				...(candidates !== undefined && candidates.length > 0 && { candidates }),
			};
		return { code: output, inlined: edits.length, unresolved, candidates };
	}
}
