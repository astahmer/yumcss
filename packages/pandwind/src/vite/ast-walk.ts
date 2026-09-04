import { NodeKind } from "../ast-node-kind.ts";
/**
 * Pure AST walking helpers shared by the vite passes.
 *
 * Browser-safe on purpose: the playground's eval engine imports
 * `bindingIsShadowedOrWritten` (via cx-inline) to mirror the build-time
 * constant-propagation rules, so this module must never pull in node
 * builtins — keep it to plain AST traversal only.
 */
import type { OxcNode } from "../tw/literal.ts";

/** Depth-first walk over every object node reachable from `node`. */
function* iterAll(node: OxcNode): Generator<OxcNode> {
	const queue: unknown[] = [node];
	for (let head = 0; head < queue.length; head++) {
		const current = queue[head];
		if (Array.isArray(current)) {
			queue.push(...current);
		} else if (current !== null && typeof current === "object") {
			yield current as OxcNode;
			queue.push(...Object.values(current as Record<string, unknown>));
		}
	}
}

/**
 * True when the module binds or writes to `name` anywhere: nested
 * declarators, parameters, functions/classes, catch params, destructured
 * shorthand properties, or plain assignment/update targets. Reads do NOT
 * count — they are the point.
 */
export function bindingIsShadowedOrWritten(program: OxcNode, name: string): boolean {
	for (const node of iterAll(program)) {
		switch ((node as { type?: string }).type) {
			case NodeKind.VariableDeclarator:
			case NodeKind.FunctionDeclaration:
			case NodeKind.ClassDeclaration:
			case NodeKind.CatchClause: {
				const id =
					(node as { id?: OxcNode | null; param?: OxcNode | null }).id ??
					(node as { param?: OxcNode | null }).param;
				if ((id as { name?: string } | undefined)?.name === name) return true;
				break;
			}
			case NodeKind.Property: {
				// Destructured bindings (`function F({ NAME }`) bind through
				// shorthand properties.
				const prop = node as { shorthand?: boolean; key?: { name?: string } };
				if (prop.shorthand === true && prop.key?.name === name) return true;
				break;
			}
			case NodeKind.AssignmentExpression: {
				let target: OxcNode | undefined = (node as { left?: OxcNode }).left;
				while (target && (target as { type?: string }).type === NodeKind.MemberExpression) {
					target = (target as { object?: OxcNode | null }).object ?? undefined;
				}
				if (
					(target as { type?: string }).type === NodeKind.Identifier &&
					(target as { name?: string }).name === name
				) {
					return true;
				}
				break;
			}
			default:
				break;
		}
	}
	return false;
}
