import type { StyleProgram } from "./semantic-ir.ts";

/** Replaceable semantic policy used by the adapter migration use case. */
export interface MigrationProgramPolicy {
	hasDynamic(program: StyleProgram): boolean;
	hasFunctionDynamic(program: StyleProgram): boolean;
	needsRawTemplate(program: StyleProgram): boolean;
}

class DefaultMigrationProgramPolicy implements MigrationProgramPolicy {
	hasDynamic(program: StyleProgram): boolean {
		return program.rules.some(
			(rule) =>
				rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
				rule.children.some((child) => this.hasDynamic({ ...program, rules: [child] })),
		);
	}

	hasFunctionDynamic(program: StyleProgram): boolean {
		return program.rules.some(
			(rule) =>
				rule.declarations.some(
					(declaration) =>
						declaration.value.kind === "dynamic" &&
						/=>|\bfunction\b/.test(declaration.value.expression),
				) || rule.children.some((child) => this.hasFunctionDynamic({ ...program, rules: [child] })),
		);
	}

	needsRawTemplate(program: StyleProgram): boolean {
		// A template is source syntax, not a reason to retain the source runtime.
		// Once its declarations parsed without residuals, the target can emit the
		// equivalent static object/class and the old CSS-in-JS runtime disappears.
		// Keep raw syntax only for parse failures, dynamic selectors, or host
		// attributes whose execution depends on props/theme. Ordinary dynamic
		// declarations are lowered through the target's static class plus vars
		// carrier and must not force a runtime stylesheet.
		if (
			(program.source?.subjectAttrs !== undefined &&
				/=>|\bfunction\b|\b(?:props|theme|attrs)\b/.test(program.source.subjectAttrs)) ||
			program.residuals.some((residual) => residual.kind === "parse") ||
			program.residuals.some(
				(residual) =>
					residual.kind === "dynamic" &&
					(residual.hint?.includes("condition") === true ||
						residual.hint?.includes("selector") === true),
			)
		)
			return true;
		return false;
	}
}

export const DEFAULT_MIGRATION_PROGRAM_POLICY: MigrationProgramPolicy =
	new DefaultMigrationProgramPolicy();

export const createMigrationProgramPolicy = (
	policy: MigrationProgramPolicy = DEFAULT_MIGRATION_PROGRAM_POLICY,
): MigrationProgramPolicy => policy;
