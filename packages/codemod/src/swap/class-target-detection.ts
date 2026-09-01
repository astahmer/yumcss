const classAttribute =
	/\b(className|class)\s*=\s*(?:(["'])([^"']*)\2|\{\s*([A-Za-z_$][\w$]*)\s*\})/g;
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
