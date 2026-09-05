import { SourcePass } from "../source-pass-utils.ts";

const classAttribute =
	/\b(className|class)\s*=\s*(?:(["'])([^"']*)\2|\{\s*(["'])([^"']*)\4\s*\}|\{\s*([A-Za-z_$][\w$]*)\s*\})/g;
const classAssignment = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"']*)\2/g;
const classLiteral = /(["'])([^"']*\[[^"']*)\1/g;
const classMapAssignment =
	/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{[\s\S]*?["'][A-Za-z_$][\w$-]*["']\s*:\s*["'][^"']*\[[^"']*/u;

/** Shared syntax evidence for class/compiler adapters. Policy stays in the adapter. */
export function detectStaticClassTarget(source: string): {
	readonly matched: boolean;
	readonly confidence: number;
	readonly evidence: readonly string[];
} {
	const matched =
		classAttribute.test(source) ||
		[...source.matchAll(classAssignment)].some((item) => (item[3] ?? "").includes("[")) ||
		classLiteral.test(source) ||
		classMapAssignment.test(source);
	classAttribute.lastIndex = 0;
	classAssignment.lastIndex = 0;
	classLiteral.lastIndex = 0;
	return {
		matched,
		confidence: matched ? 0.6 : 0,
		evidence: matched ? ["literal-class-attribute"] : [],
	};
}

/**
 * Return non-literal class bindings as semantic evidence for class adapters.
 * A dynamic class expression is not a static migration match, but it must
 * still be visible to the route as an explicit residual instead of looking
 * like an empty/no-op source file.
 */
export function collectDynamicClassAttributes(source: string): readonly string[] {
	const residuals: string[] = [];
	for (const match of source.matchAll(/\b(?:className|class)\s*=\s*\{/g)) {
		const start = match.index ?? 0;
		const open = start + match[0].lastIndexOf("{");
		const block = SourcePass.matchBlock(source, open);
		if (block === null) {
			residuals.push(source.slice(start));
			continue;
		}
		const body = block.body.trim();
		if (/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/u.test(body)) continue;
		const binding = /^[A-Za-z_$][\w$]*$/u.exec(body)?.[0];
		if (
			binding !== undefined &&
			new RegExp(
				`\\b(?:const|let|var)\\s+${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*(["'])([^"']*)\\1`,
			).test(source)
		)
			continue;
		residuals.push(source.slice(start, block.end));
	}
	return residuals;
}
