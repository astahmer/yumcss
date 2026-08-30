import { computeExcludedRanges, matchBlock } from "../../../source-pass-utils.ts";
import { parseObjectLiteral } from "../../parse.ts";
import { literalToPlain } from "./parse.ts";
import type { PandaMigrationFile } from "./migration-discovery.ts";

export interface PandaRecipeDefinition {
	readonly name: string;
	readonly kind: "cva" | "sva";
	readonly file: PandaMigrationFile;
	readonly start: number;
	readonly end: number;
	readonly body: string;
}

export interface PandaRecipeCallSite {
	readonly file: PandaMigrationFile;
	readonly start: number;
	readonly end: number;
	readonly argsLiteral: boolean;
	readonly props?: Record<string, string>;
}

/** Panda recipe-source policy for safely removing executable anatomy helpers. */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped Panda recipe policy
export class PandaRecipeSource {
	static definitions(file: PandaMigrationFile): PandaRecipeDefinition[] {
		const excluded = computeExcludedRanges(file.source, file.path);
		const definitions: PandaRecipeDefinition[] = [];
		for (const match of file.source.matchAll(
			/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:(cva|defineRecipe)|(sva|defineSlotRecipe))\s*\(\s*\{/g,
		)) {
			if (excluded.isExcluded(match.index ?? -1)) continue;
			const open = (match.index ?? 0) + match[0].length - 1;
			const block = matchBlock(file.source, open);
			if (block === null) continue;
			let end = block.end;
			while (/\s/.test(file.source[end] ?? "")) end++;
			if (file.source[end] === ")") {
				end++;
				if (file.source[end] === ";") end++;
			}
			definitions.push({
				name: match[1]!,
				kind: match[3] === undefined ? "cva" : "sva",
				file,
				start: match.index ?? 0,
				end,
				body: block.body,
			});
		}
		return definitions;
	}

	static callSites(
		files: readonly PandaMigrationFile[],
		definition: PandaRecipeDefinition,
		exportNames: ReadonlyMap<string, string>,
	): PandaRecipeCallSite[] {
		const names = [definition.name];
		const className = exportNames.get(definition.name);
		if (className !== undefined && className !== definition.name) names.push(className);
		const sites: PandaRecipeCallSite[] = [];
		for (const file of files) {
			for (const name of names) {
				const pattern = new RegExp(`(?<![\\w.$])${name}\\s*\\(`, "g");
				for (const match of file.source.matchAll(pattern)) {
					const start = match.index ?? 0;
					if (
						file.path === definition.file.path &&
						start >= definition.start &&
						start < definition.end
					)
						continue;
					const open = start + match[0].length - 1;
					let depth = 0;
					let end = open;
					for (; end < file.source.length; end++) {
						if (file.source[end] === "(") depth++;
						else if (file.source[end] === ")") {
							depth--;
							if (depth === 0) break;
						}
					}
					const args = file.source.slice(open + 1, end).trim();
					const body = args.startsWith("{")
						? args.slice(1, args.endsWith("}") ? -1 : undefined)
						: null;
					const parsed = body === null ? null : parseObjectLiteral(body);
					const empty = args === "{}";
					sites.push({
						file,
						start,
						end: end + 1,
						argsLiteral: args === "" || empty || parsed !== null,
						props: empty
							? {}
							: parsed === null
								? undefined
								: (literalToPlain(parsed) as Record<string, string>),
					});
				}
			}
		}
		return sites;
	}

	static stripSpreadElements(body: string): string | null {
		let result = body;
		let stripped = false;
		for (;;) {
			const call = /\.\.\.\s*[\w$]+\s*\(/.exec(result);
			if (call !== null) {
				const open = (call.index ?? 0) + call[0].length - 1;
				let depth = 0;
				let end = open;
				for (; end < result.length; end++) {
					if (result[end] === "(") depth++;
					else if (result[end] === ")") {
						depth--;
						if (depth === 0) break;
					}
				}
				if (depth !== 0) return null;
				let after = end + 1;
				if (result[after] === ",") after++;
				result = result.slice(0, call.index ?? 0) + result.slice(after);
				stripped = true;
				continue;
			}
			const identifier = /\.\.\.\s*[\w$]+\s*(?=[,}])/.exec(result);
			if (identifier !== null) {
				let after = (identifier.index ?? 0) + identifier[0].length;
				if (result[after] === ",") after++;
				result = result.slice(0, identifier.index ?? 0) + result.slice(after);
				stripped = true;
				continue;
			}
			const callValue = /([\w$]+|["'][^"']*["'])\s*:\s*[\w$]+\s*\(/.exec(result);
			if (callValue === null) break;
			const open = (callValue.index ?? 0) + callValue[0].length - 1;
			let depth = 0;
			let end = open;
			for (; end < result.length; end++) {
				if (result[end] === "(") depth++;
				else if (result[end] === ")") {
					depth--;
					if (depth === 0) break;
				}
			}
			if (depth !== 0) return null;
			result =
				result.slice(0, callValue.index ?? 0) + `${callValue[1]}: {}` + result.slice(end + 1);
			stripped = true;
		}
		return stripped ? result : null;
	}
}
