import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import type { OxcNode } from "../tw/literal.ts";

export interface CxImportInfo {
	readonly localNames: Set<string>;
	readonly sources: string[];
	readonly program: OxcNode;
}

/** Source-language-neutral import discovery for the cx compiler. */
class CxImportScanner {
	find(
		code: string,
		id: string,
		matches: (source: string) => boolean,
		parsedProgram?: OxcNode,
	): CxImportInfo {
		const program =
			parsedProgram ??
			(SOURCE_SCANNER_SERVICE.parse({
				file: id,
				source: code,
				language: SOURCE_SCANNER_SERVICE.languageForFile(id),
			}).program as unknown as OxcNode);
		const info = { localNames: new Set<string>(), sources: [] as string[] };
		const queue: unknown[] = [program];
		for (let head = 0; head < queue.length; head++) {
			const current = queue[head];
			if (Array.isArray(current)) {
				queue.push(...current);
				continue;
			}
			if (current === null || typeof current !== "object") continue;
			const node = current as OxcNode;
			if (node.type === "ImportDeclaration") {
				const declaration = node as {
					source?: { value?: string };
					specifiers?: Array<{
						type?: string;
						imported?: { name?: string };
						local?: { name?: string };
					}>;
				};
				const source = declaration.source?.value;
				if (typeof source === "string" && matches(source)) {
					info.sources.push(source);
					for (const specifier of declaration.specifiers ?? []) {
						if (
							specifier.type === "ImportSpecifier" &&
							specifier.imported?.name === "cx" &&
							specifier.local?.name !== undefined
						)
							info.localNames.add(specifier.local.name);
					}
				}
			}
			queue.push(...Object.values(node));
		}
		return { ...info, program };
	}
}

export const cxImportScanner = new CxImportScanner();
