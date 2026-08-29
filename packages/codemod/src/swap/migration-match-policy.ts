import type { StyleProgram } from "./semantic-ir.ts";
import { intrinsicTagForSubject } from "./host-component-rewriter.ts";

/** Syntax-only host matching policy shared by migration orchestration. */
export class MigrationMatchPolicy {
	static standaloneTag(source: string, start: number): string | undefined {
		const subject = source
			.slice(start)
			.match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
			.trim();
		return subject === undefined ? undefined : intrinsicTagForSubject(subject);
	}

	static isStandaloneDefaultExport(source: string, start: number): boolean {
		return /export\s+default\s*$/.test(source.slice(0, start));
	}

	static binding(source: string, start: number): string | undefined {
		return source.slice(0, start).match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1];
	}

	static classExpression(emitted: string): string | undefined {
		const expression = emitted.trim();
		return expression.length === 0 ? undefined : expression;
	}

	static nonOverlapping<T extends { start: number; end: number; program: StyleProgram }>(
		matches: readonly T[],
	): readonly T[] {
		const selected: T[] = [];
		for (const match of matches.toSorted(
			(left, right) => left.start - right.start || right.end - left.end,
		)) {
			const containing = selected.at(-1);
			if (containing === undefined || match.start >= containing.end) {
				selected.push(match);
				continue;
			}
			if (
				containing.start <= match.start &&
				match.end <= containing.end &&
				containing.program.source?.hostOpenTag !== undefined
			)
				continue;
			if (match.start === containing.start && match.end > containing.end)
				selected[selected.length - 1] = match;
		}
		return selected;
	}
}
