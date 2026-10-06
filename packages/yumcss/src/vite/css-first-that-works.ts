import type { Expression } from "oxc-parser";
import { encodeFirstThatWorks, type FirstThatWorksValue } from "../css/first-that-works.ts";
import { isSafeCssValue } from "../css/value-normalization.ts";
import { NodeKind } from "../ast-node-kind.ts";
import {
	evalLiteral,
	type LiteralCallEvaluator,
	type LiteralConstantScope,
} from "../tw/literal.ts";

/** Build-time evaluator for the explicitly imported CSS fallback helper. */
export const createFirstThatWorksEvaluator =
	(names: ReadonlySet<string>): LiteralCallEvaluator =>
	(node: Expression, consts?: LiteralConstantScope): FirstThatWorksValue | undefined => {
		if (node.type !== NodeKind.CallExpression) return undefined;
		const callee = node.callee;
		if (
			callee?.type !== NodeKind.Identifier ||
			!names.has((callee as { name?: string }).name ?? "")
		)
			return undefined;
		const values: Array<string | number> = [];
		for (const argument of node.arguments) {
			if (argument.type === NodeKind.SpreadElement) return undefined;
			const value = evalLiteral(argument, consts);
			if (!isSafeCssValue(value)) return undefined;
			values.push(value);
		}
		if (values.length < 2) return undefined;
		return encodeFirstThatWorks(values) as FirstThatWorksValue;
	};
