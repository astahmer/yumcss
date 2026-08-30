import { join } from "node:path";
import { readFileSync } from "node:fs";
import type {
	AdapterConfigContext,
	AdapterDetectionContext,
	AdapterParseContext,
	AdapterProjectConfig,
} from "./adapter-contract.ts";
import type { StyleProgramSource } from "./semantic-ir.ts";
import { findTemplateLiteralEnd } from "./adapter-template-parser.ts";

/** Shared mechanics used by adapter definitions; no ecosystem policy lives here. */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped adapter mechanics
export class CodemodAdapterSupport {
	static sourceName(source: string, start: number, fallback: string): string {
		const prefix = source.slice(Math.max(0, start - 160), start);
		return prefix.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1] ?? fallback;
	}

	static config(
		id: string,
		configFiles: readonly string[],
		context: AdapterConfigContext,
	): AdapterProjectConfig {
		const files: string[] = [];
		const values: Record<string, unknown> = {};
		const readFile =
			context.readFile ??
			((file: string) => {
				try {
					return readFileSync(file, "utf8");
				} catch {
					return undefined;
				}
			});
		const packageText =
			context.packageJson === undefined && context.root !== undefined
				? readFile(join(context.root, "package.json"))
				: undefined;
		let packageJson = context.packageJson;
		if (packageJson === undefined && packageText !== undefined) {
			try {
				packageJson = JSON.parse(packageText) as Readonly<Record<string, unknown>>;
			} catch {
				values.packageJsonError = "package.json could not be parsed";
			}
		}
		if (packageJson !== undefined) values.packageJson = packageJson;
		for (const relative of configFiles) {
			if (context.root === undefined) continue;
			const file = join(context.root, relative);
			const text = readFile(file);
			if (text === undefined) continue;
			files.push(file);
			if (relative.endsWith(".json")) {
				try {
					values[relative] = JSON.parse(text);
				} catch {
					values[`${relative}:error`] = "configuration JSON could not be parsed";
				}
			} else values[relative] = text;
		}
		return { adapter: id, root: context.root, files, values };
	}

	static detect(
		patterns: readonly RegExp[],
		context: AdapterDetectionContext,
	): { matched: boolean; confidence: number; evidence: string[] } {
		const evidence = patterns.flatMap((pattern) => {
			pattern.lastIndex = 0;
			const matched = pattern.test(context.source);
			pattern.lastIndex = 0;
			return matched ? [pattern.source] : [];
		});
		return {
			matched: evidence.length > 0,
			confidence: evidence.length === 0 ? 0 : Math.min(1, 0.5 + evidence.length * 0.2),
			evidence,
		};
	}

	static source(
		context: AdapterParseContext,
		start: number,
		extra: Partial<StyleProgramSource> = {},
	) {
		return {
			file: context.file,
			start,
			adapter: context.config.adapter,
			...(context.document?.framework ? { framework: context.document.framework } : {}),
			...extra,
		};
	}

	static styledSubject(source: string, start: number): Partial<StyleProgramSource> {
		const firstTick = CodemodAdapterSupport.findStyledTemplateStart(source, start);
		const end =
			firstTick === -1 ? CodemodAdapterSupport.findStyledObjectOpen(source, start) : firstTick;
		if (end === -1) return {};
		const prefix = source.slice(start, end).trim();
		const match = prefix.match(/^styled\s*(?:\.|\()/);
		if (match === null) return {};
		const attrs = CodemodAdapterSupport.subjectAttrs(prefix);
		return {
			subject: prefix,
			subjectKind: prefix.slice("styled".length).trim().startsWith(".") ? "member" : "call",
			...(attrs === undefined ? {} : { subjectAttrs: attrs }),
		};
	}

	static findStyledTemplateStart(source: string, start: number): number {
		let depth = 0;
		let quote: string | undefined;
		for (let index = start; index < source.length; index++) {
			const character = source[index]!;
			if (quote !== undefined) {
				if (character === quote && source[index - 1] !== "\\") quote = undefined;
				continue;
			}
			if (character === "'" || character === '"') {
				quote = character;
				continue;
			}
			if (character === "`") {
				if (depth === 0) return index;
				quote = character;
				continue;
			}
			if (character === "(" || character === "{" || character === "[") depth++;
			if (character === ")" || character === "}" || character === "]")
				depth = Math.max(0, depth - 1);
		}
		return -1;
	}

	static findStyledObjectOpen(source: string, start: number): number {
		const statementEnd = source.indexOf(";", start);
		const segment = source.slice(start, statementEnd === -1 ? source.length : statementEnd);
		let result = -1;
		for (const match of segment.matchAll(/\(\s*\{/g)) result = start + (match.index ?? 0);
		return result;
	}

	static subjectAttrs(subject: string): string | undefined {
		const markerStart = subject.indexOf(".attrs");
		if (markerStart === -1) return undefined;
		const open = subject.indexOf("(", markerStart + ".attrs".length);
		if (open === -1) return undefined;
		let depth = 0;
		let quote: string | undefined;
		for (let index = open; index < subject.length; index++) {
			const character = subject[index]!;
			if (quote !== undefined) {
				if (character === quote && subject[index - 1] !== "\\") quote = undefined;
				continue;
			}
			if (character === '"' || character === "'" || character === "`") {
				quote = character;
				continue;
			}
			if (character === "(") depth++;
			if (character === ")") {
				depth--;
				if (depth === 0) return subject.slice(open + 1, index).trim();
			}
		}
		return undefined;
	}

	static templateEnd(source: string, start: number): number | undefined {
		return findTemplateLiteralEnd(source, start);
	}
}
