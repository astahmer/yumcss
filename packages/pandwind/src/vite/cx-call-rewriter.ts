import type { Expression } from "oxc-parser";
import { parseSourceProgram } from "../source-scanner.ts";
import { createCx, type CxInput } from "../cx/index.ts";
import { ATOM_REGISTRY } from "../css/atoms.ts";
import type { CssFn } from "../css/create-css.ts";
import type { OxcNode } from "../tw/literal.ts";
import type { TwConfig, OnUnresolved } from "./inline.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
import { createLineIndex, collectUnresolvedTokens, type UnresolvedToken } from "./unresolved.ts";
import {
	buildFoldSkeleton,
	collectModuleConstants,
	CX_NOT_STATIC,
	evalStaticCx,
	mergeImportedConstants,
	renderFoldSkeleton,
	type ConstantScope,
	type CxFoldContext,
	type KnownConstant,
	type StaticEval,
} from "./cx-static-evaluator.ts";

export interface CxCompilerPorts {
	readonly collectConstants: (program: OxcNode) => ConstantScope;
	readonly evaluate: (node: Expression | undefined, fold?: CxFoldContext, constants?: ConstantScope) => StaticEval;
	readonly buildSkeleton: (node: Expression, constants: ConstantScope, code: string) => import("./cx-static-evaluator.ts").FoldSkeleton | null;
	readonly renderSkeleton: typeof renderFoldSkeleton;
	readonly mergeConstants: typeof mergeImportedConstants;
}

export const defaultCxCompilerPorts: CxCompilerPorts = {
	collectConstants: collectModuleConstants,
	evaluate: evalStaticCx,
	buildSkeleton: buildFoldSkeleton,
	renderSkeleton: renderFoldSkeleton,
	mergeConstants: mergeImportedConstants,
};

export interface CxCompilerOptions {
	readonly importedConstants?: ConstantScope;
	readonly fold?: CxFoldContext;
	readonly constants?: boolean;
	readonly partialFold?: boolean;
	readonly onUnresolved?: OnUnresolved;
}

export interface CxRewriteResult {
	readonly code: string;
	readonly inlined: number;
	readonly unresolved?: UnresolvedToken[];
}

interface CallNode {
	type: "CallExpression";
	start: number;
	end: number;
	callee: { type?: string; name?: string } | null;
	arguments: Expression[];
}

const walkCalls = (root: unknown, visit: (call: CallNode) => void): void => {
	const queue: unknown[] = [root];
	for (let head = 0; head < queue.length; head++) {
		const current = queue[head];
		if (Array.isArray(current)) { queue.push(...current); continue; }
		if (current === null || typeof current !== "object") continue;
		const node = current as { type?: string };
		if (node.type === "CallExpression") visit(current as CallNode);
		queue.push(...Object.values(current));
	}
};

export class CxCallRewriter {
	constructor(private readonly ports: CxCompilerPorts = defaultCxCompilerPorts) {}

	rewrite(code: string, id: string, config: TwConfig, cxNames: ReadonlySet<string>, options: CxCompilerOptions = {}): CxRewriteResult {
		const fold = options.fold;
		if (cxNames.size === 0 && fold === undefined) return { code, inlined: 0 };
		const program = parseSourceProgram({ file: id, source: code }).program as unknown as OxcNode;
		const constants = options.constants === false ? new Map<string, KnownConstant>() : this.ports.mergeConstants(program, this.ports.collectConstants(program), options.importedConstants);
		const evaluate = createCx({
			conflicts: config.conflicts,
			compose: config.compose,
			...(fold === undefined ? {} : { css: { [ATOM_REGISTRY]: fold.engine.registry } as unknown as CssFn<never> }),
		});
		const merge = (inputs: CxInput[]): string | undefined => {
			try { return evaluate(...inputs); } catch { return undefined; }
		};
		const edits: Array<{ start: number; end: number; text: string }> = [];
		const unresolved: UnresolvedToken[] = [];
		const lines = options.onUnresolved !== undefined && options.onUnresolved !== "off" ? createLineIndex(code) : undefined;
		const partial = options.partialFold !== false;

		walkCalls(program, (call) => {
			if (call.callee?.type !== "Identifier" || !cxNames.has(call.callee.name ?? "")) return;
			const inputs: StaticEval[] = [];
			let conditional: { index: number; node: Expression } | undefined;
			for (let index = 0; index < call.arguments.length; index++) {
				const value = this.ports.evaluate(call.arguments[index], fold, constants);
				if (value !== CX_NOT_STATIC) { inputs.push(value); continue; }
				const argument = call.arguments[index]!;
				const type = (argument as { type?: string }).type;
				if (partial && conditional === undefined && (type === "ConditionalExpression" || type === "LogicalExpression")) {
					conditional = { index, node: argument };
					inputs.push(CX_NOT_STATIC);
					continue;
				}
				return;
			}
			let replacement: string | null = null;
			if (conditional === undefined) {
				const merged = merge(inputs as CxInput[]);
				if (merged !== undefined) {
					replacement = JSON.stringify(merged);
					if (lines !== undefined) unresolved.push(...collectUnresolvedTokens(merged, lines.lineOf(call.start), config));
				}
			} else {
				const skeleton = this.ports.buildSkeleton(conditional.node, constants, code);
				if (skeleton !== null) replacement = this.ports.renderSkeleton(skeleton, conditional.index, inputs, merge);
			}
			if (replacement !== null) edits.push({ start: call.start, end: call.end, text: replacement });
		});

		let output = code;
		for (const edit of edits.toSorted((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
		return edits.length === 0 ? { code, inlined: 0 } : { code: output, inlined: edits.length, unresolved };
	}
}
