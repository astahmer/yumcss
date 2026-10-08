import { SOURCE_SCANNER_SERVICE, SourceBindings } from "yumcss/source";
import { SourcePass } from "../source-pass-utils.ts";
import { normalizeProjectRelativePath } from "./project-path.ts";
import type { AdapterFileChange } from "./adapter-contract.ts";

const moduleReferences = (file: string, source: string) => {
	const document = SOURCE_SCANNER_SERVICE.scan({ file, source });
	if (document.diagnostics.some((diagnostic) => diagnostic.kind === "parse"))
		throw new Error(`codemod: cannot compose file changes for invalid source ${file}`);
	return SourceBindings.fromDocument(document.document).moduleReferences;
};

export class MigrationFilePlan {
	static rewrite(input: {
		readonly file: string;
		readonly source: string;
		readonly change: AdapterFileChange;
	}): string {
		const { change, source, file } = input;
		const normalizedFile = normalizeProjectRelativePath(file);
		if (source === change.expectedContent || source === change.content) return change.content;
		if (change.expectedContent === undefined)
			throw new Error(`codemod: missing baseline for composed file change ${normalizedFile}`);
		const before = moduleReferences(normalizedFile, change.expectedContent);
		const after = moduleReferences(normalizedFile, change.content);
		if (before.length !== after.length)
			throw new Error(`codemod: conflicting non-import file change ${normalizedFile}`);
		const baselineEdits = before.flatMap((reference, index) => {
			const replacement = after[index];
			if (replacement === undefined || reference.source === replacement.source) return [];
			return [{ ...reference.range, text: JSON.stringify(replacement.source) }];
		});
		const normalizedBefore = SourcePass.applyEdits(change.expectedContent, baselineEdits);
		const normalizedAfter = SourcePass.applyEdits(
			change.content,
			after.flatMap((reference, index) => {
				if (before[index]?.source === reference.source) return [];
				return [{ ...reference.range, text: JSON.stringify(reference.source) }];
			}),
		);
		if (normalizedBefore !== normalizedAfter)
			throw new Error(`codemod: conflicting non-import file change ${normalizedFile}`);
		const replacements = new Map<string, string>();
		before.forEach((reference, index) => {
			const replacement = after[index];
			if (replacement !== undefined && reference.source !== replacement.source) {
				const previous = replacements.get(reference.source);
				if (previous !== undefined && previous !== replacement.source)
					throw new Error(`codemod: conflicting import destinations in ${normalizedFile}`);
				replacements.set(reference.source, replacement.source);
			}
		});
		return SourcePass.applyEdits(
			source,
			moduleReferences(normalizedFile, source).flatMap((reference) => {
				const replacement = replacements.get(reference.source);
				if (replacement === undefined) return [];
				const quote = source[reference.range.start];
				return [
					{
						...reference.range,
						text:
							quote === "'"
								? `'${replacement.replaceAll("'", "\\'")}'`
								: JSON.stringify(replacement),
					},
				];
			}),
		);
	}

	static compose(input: {
		readonly changes: readonly AdapterFileChange[];
		readonly canonicalizePath?: (path: string) => string;
	}): readonly AdapterFileChange[] {
		const planned = new Map<string, AdapterFileChange>();
		for (const change of input.changes) {
			const path = normalizeProjectRelativePath(
				input.canonicalizePath?.(change.path) ?? change.path,
			);
			const normalizedChange = { ...change, path };
			const previous = planned.get(path);
			if (previous === undefined) {
				planned.set(path, normalizedChange);
				continue;
			}
			if (previous.content === change.content) {
				if (
					previous.expectedContent !== undefined &&
					change.expectedContent !== undefined &&
					previous.expectedContent !== change.expectedContent
				)
					throw new Error(`codemod: conflicting file change baselines for ${path}`);
				const expectedContent = previous.expectedContent ?? change.expectedContent;
				planned.set(path, {
					...previous,
					...(expectedContent === undefined ? {} : { expectedContent }),
				});
				continue;
			}
			if (previous.expectedContent !== change.expectedContent)
				throw new Error(`codemod: conflicting file change baselines for ${path}`);
			if (change.expectedContent !== undefined) {
				const baselineReferences = moduleReferences(path, change.expectedContent);
				const previousReferences = moduleReferences(path, previous.content);
				const nextReferences = moduleReferences(path, change.content);
				if (
					previousReferences.length === baselineReferences.length &&
					nextReferences.length === baselineReferences.length
				) {
					baselineReferences.forEach((reference, index) => {
						const earlier = previousReferences[index]?.source;
						const next = nextReferences[index]?.source;
						if (earlier !== reference.source && next !== reference.source && earlier !== next)
							throw new Error(`codemod: conflicting import destinations in ${path}`);
					});
				}
			}
			planned.set(path, {
				...previous,
				content: MigrationFilePlan.rewrite({
					file: path,
					source: previous.content,
					change: normalizedChange,
				}),
			});
		}
		return [...planned.values()];
	}
}
