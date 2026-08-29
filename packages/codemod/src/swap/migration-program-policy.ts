import type { StyleProgram } from "./semantic-ir.ts";

/** Replaceable semantic policy used by the adapter migration use case. */
export interface MigrationProgramPolicy {
	hasDynamic(program: StyleProgram): boolean;
	hasFunctionDynamic(program: StyleProgram): boolean;
	needsRawTemplate(program: StyleProgram): boolean;
}

class DefaultMigrationProgramPolicy implements MigrationProgramPolicy {
	hasDynamic(program: StyleProgram): boolean {
		return program.rules.some((rule) =>
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
				) ||
					rule.children.some((child) =>
						this.hasFunctionDynamic({ ...program, rules: [child] }),
					),
		);
	}

	needsRawTemplate(program: StyleProgram): boolean {
		if (program.source?.template !== undefined || program.source?.subjectAttrs !== undefined)
			return true;
		return program.rules.some((rule) =>
			rule.children.some(
				(child) => child.selector !== undefined && !child.selector.trim().startsWith("&"),
			) ||
				rule.children.some((child) => this.needsRawTemplate({ ...program, rules: [child] })),
		);
	}
}

export const DEFAULT_MIGRATION_PROGRAM_POLICY: MigrationProgramPolicy =
	new DefaultMigrationProgramPolicy();

export const createMigrationProgramPolicy = (
	policy: MigrationProgramPolicy = DEFAULT_MIGRATION_PROGRAM_POLICY,
): MigrationProgramPolicy => policy;

