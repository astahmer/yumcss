import {
	STYLE_PROGRAM_SCHEMA,
	StyleRuleKindTag,
	StyleValueKindTag,
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
	type StyleRuleKind,
	type StyleValue,
} from "./semantic-ir.ts";

/** Versioned envelope for programs exchanged between compiler/tooling stages. */
export const STYLE_PROGRAM_ARTIFACT_SCHEMA = "pandwind.style-program-artifact/1" as const;
export const STYLE_PROGRAM_CORE_VERSION = "1" as const;

export interface StyleProgramArtifact {
	readonly schema: typeof STYLE_PROGRAM_ARTIFACT_SCHEMA;
	readonly coreVersion: typeof STYLE_PROGRAM_CORE_VERSION;
	readonly fingerprint: string;
	readonly program: StyleProgram;
}

export interface StyleProgramIssue {
	readonly path: string;
	readonly message: string;
}

export interface StyleProgramValidation {
	readonly valid: boolean;
	readonly issues: readonly StyleProgramIssue[];
}

const STYLE_RULE_KINDS: ReadonlySet<StyleRuleKind> = new Set([
	StyleRuleKindTag.Style,
	StyleRuleKindTag.Global,
	StyleRuleKindTag.Keyframes,
	StyleRuleKindTag.FontFace,
	StyleRuleKindTag.Layer,
	StyleRuleKindTag.Supports,
	StyleRuleKindTag.Property,
]);
const STYLE_VALUE_KINDS: ReadonlySet<StyleValue["kind"]> = new Set([
	StyleValueKindTag.Token,
	StyleValueKindTag.Literal,
	StyleValueKindTag.Dynamic,
]);

/**
 * Stable compiler-core operations over the versioned semantic IR.
 *
 * This is intentionally a scoped utility domain rather than a second AST or
 * a bytecode interpreter. Frontend adapters produce `StyleProgram`; target
 * adapters consume it; this class owns only the invariants between them.
 */
export class StyleProgramCore {
	static normalize(program: StyleProgram): StyleProgram {
		const { schema: _schema, rules, declarations: _declarations, ...options } = program;
		return styleProgramFromRules(
			rules,
			options as StyleProgramOptions & {
				residuals?: readonly StyleProgramResidual[];
			},
		);
	}

	static validate(program: unknown): StyleProgramValidation {
		const issues: StyleProgramIssue[] = [];
		if (!isRecord(program)) {
			return { valid: false, issues: [{ path: "$", message: "program must be an object" }] };
		}
		if (program.schema !== STYLE_PROGRAM_SCHEMA)
			issues.push({ path: "schema", message: `expected ${STYLE_PROGRAM_SCHEMA}` });
		if (!Array.isArray(program.rules)) issues.push({ path: "rules", message: "must be an array" });
		if (!Array.isArray(program.declarations))
			issues.push({ path: "declarations", message: "must be an array" });
		if (!Array.isArray(program.residuals))
			issues.push({ path: "residuals", message: "must be an array" });
		if (Array.isArray(program.rules)) {
			for (const [index, rule] of program.rules.entries())
				validateRule(rule, `rules[${index}]`, issues);
		}
		return { valid: issues.length === 0, issues };
	}

	static canonical(program: StyleProgram): string {
		return stableStringify(StyleProgramCore.normalize(program));
	}

	static fingerprint(program: StyleProgram): string {
		return fingerprintCanonical(StyleProgramCore.canonical(program));
	}

	static encode(program: StyleProgram): StyleProgramArtifact {
		const normalized = StyleProgramCore.normalize(program);
		return {
			schema: STYLE_PROGRAM_ARTIFACT_SCHEMA,
			coreVersion: STYLE_PROGRAM_CORE_VERSION,
			fingerprint: fingerprintCanonical(stableStringify(normalized)),
			program: normalized,
		};
	}

	static decode(input: unknown): StyleProgram {
		if (!isRecord(input)) throw new TypeError("StyleProgram artifact must be an object");
		if (input.schema !== STYLE_PROGRAM_ARTIFACT_SCHEMA)
			throw new TypeError(`unsupported StyleProgram artifact schema: ${String(input.schema)}`);
		if (input.coreVersion !== STYLE_PROGRAM_CORE_VERSION)
			throw new TypeError(`unsupported StyleProgram core version: ${String(input.coreVersion)}`);
		const validation = StyleProgramCore.validate(input.program);
		if (!validation.valid) throw new TypeError(formatIssues(validation.issues));
		const program = StyleProgramCore.normalize(input.program as StyleProgram);
		if (input.fingerprint !== StyleProgramCore.fingerprint(program))
			throw new TypeError("StyleProgram artifact fingerprint does not match its program");
		return program;
	}
}

function validateRule(value: unknown, path: string, issues: StyleProgramIssue[]): void {
	if (!isRecord(value)) {
		issues.push({ path, message: "rule must be an object" });
		return;
	}
	if (!STYLE_RULE_KINDS.has(value.kind as StyleRuleKind))
		issues.push({ path: `${path}.kind`, message: "unknown rule kind" });
	if (!Array.isArray(value.conditions))
		issues.push({ path: `${path}.conditions`, message: "must be an array" });
	if (!Array.isArray(value.declarations))
		issues.push({ path: `${path}.declarations`, message: "must be an array" });
	if (!Array.isArray(value.children))
		issues.push({ path: `${path}.children`, message: "must be an array" });
	if (typeof value.order !== "number" || !Number.isFinite(value.order))
		issues.push({ path: `${path}.order`, message: "must be a finite number" });
	if (Array.isArray(value.declarations)) {
		for (const [index, declaration] of value.declarations.entries()) {
			if (!isRecord(declaration)) {
				issues.push({ path: `${path}.declarations[${index}]`, message: "must be an object" });
				continue;
			}
			if (typeof declaration.property !== "string" || declaration.property.trim() === "")
				issues.push({
					path: `${path}.declarations[${index}].property`,
					message: "must be non-empty",
				});
			if (
				!isRecord(declaration.value) ||
				!STYLE_VALUE_KINDS.has(declaration.value.kind as StyleValue["kind"])
			)
				issues.push({
					path: `${path}.declarations[${index}].value`,
					message: "unknown style value",
				});
		}
	}
	if (Array.isArray(value.children)) {
		for (const [index, child] of value.children.entries())
			validateRule(child, `${path}.children[${index}]`, issues);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (!isRecord(value)) return JSON.stringify(value) ?? "null";
	return `{${Object.keys(value)
		.filter((key) => value[key] !== undefined)
		.toSorted()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(",")}}`;
}

function formatIssues(issues: readonly StyleProgramIssue[]): string {
	return `invalid StyleProgram: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`;
}

function fingerprintCanonical(canonical: string): string {
	let hash = 2166136261;
	for (const character of canonical) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `sp-${(hash >>> 0).toString(36)}`;
}
