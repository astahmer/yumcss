import type { SourceDocument } from "./source-scanner.ts";
import {
	SourceBindingKind,
	type SourceBinding,
	type SourceBindingIndex,
	SourceBindings,
} from "./source-bindings.ts";

export const SOURCE_PROJECT_BINDINGS_SCHEMA = "pandwind.source-project-bindings/1" as const;

export interface SourceProjectBindingLoader {
	read(file: string): SourceDocument | undefined;
	resolve(importer: string, specifier: string): string | undefined;
}

export interface SourceProjectBindingIndex {
	readonly schema: typeof SOURCE_PROJECT_BINDINGS_SCHEMA;
	index(file: string): SourceBindingIndex | undefined;
	resolve(file: string, localName: string): SourceBinding | undefined;
}

function readIndex(
	file: string,
	loader: SourceProjectBindingLoader,
	cache: Map<string, SourceBindingIndex | undefined>,
): SourceBindingIndex | undefined {
	if (cache.has(file)) return cache.get(file);
	const document = loader.read(file);
	if (document === undefined) {
		cache.set(file, undefined);
		return undefined;
	}
	try {
		const index = SourceBindings.fromDocument(document);
		cache.set(file, index);
		return index;
	} catch {
		cache.set(file, undefined);
		return undefined;
	}
}

/** Shared barrel indexes should build this lookup only once across consumer files. */
const reexportsByIndex = new WeakMap<
	SourceBindingIndex,
	ReadonlyMap<string, SourceBindingIndex["reexports"][number]>
>();

function reexportFor(
	index: SourceBindingIndex,
	exportedName: string,
): SourceBindingIndex["reexports"][number] | undefined {
	let byName = reexportsByIndex.get(index);
	if (byName === undefined) {
		const next = new Map<string, SourceBindingIndex["reexports"][number]>();
		for (const reexport of index.reexports)
			if (!next.has(reexport.exportedName)) next.set(reexport.exportedName, reexport);
		reexportsByIndex.set(index, next);
		byName = next;
	}
	return byName.get(exportedName);
}

function resolveExport(
	file: string,
	exportedName: string,
	loader: SourceProjectBindingLoader,
	cache: Map<string, SourceBindingIndex | undefined>,
	visited: ReadonlySet<string>,
): SourceBinding | undefined {
	const visitKey = `${file}\0${exportedName}`;
	if (visited.has(visitKey)) return undefined;
	const index = readIndex(file, loader, cache);
	if (index === undefined) return undefined;
	const reexport = reexportFor(index, exportedName);
	if (reexport !== undefined) {
		const resolvedFile = loader.resolve(file, reexport.source);
		if (resolvedFile === undefined)
			return {
				localName: exportedName,
				importedName: reexport.importedName,
				source: reexport.source,
				kind: SourceBindingKind.Reexport,
				range: reexport.range,
			};
		const nested = resolveExport(
			resolvedFile,
			reexport.importedName,
			loader,
			cache,
			new Set(visited).add(visitKey),
		);
		return (
			nested ?? {
				localName: exportedName,
				importedName: reexport.importedName,
				source: reexport.source,
				kind: SourceBindingKind.Reexport,
				range: reexport.range,
			}
		);
	}

	for (const exportAll of index.exportAllSources) {
		const resolvedFile = loader.resolve(file, exportAll.source);
		if (resolvedFile === undefined) continue;
		const nested = resolveExport(
			resolvedFile,
			exportedName,
			loader,
			cache,
			new Set(visited).add(visitKey),
		);
		if (nested !== undefined) return nested;
	}
	return undefined;
}

/**
 * Resolve imports through relative project barrels without evaluating code.
 * Package exports deliberately stop at the package boundary; the owning
 * adapter can still match that final package binding safely.
 */
export function createSourceProjectBindingIndex(
	loader: SourceProjectBindingLoader,
): SourceProjectBindingIndex {
	const cache = new Map<string, SourceBindingIndex | undefined>();
	return {
		schema: SOURCE_PROJECT_BINDINGS_SCHEMA,
		index: (file) => readIndex(file, loader, cache),
		resolve(file, localName) {
			const index = readIndex(file, loader, cache);
			const binding = index?.binding(localName);
			if (binding === undefined) return undefined;
			const resolvedFile = loader.resolve(file, binding.source);
			if (resolvedFile === undefined) return binding;
			const resolved = resolveExport(resolvedFile, binding.importedName, loader, cache, new Set());
			return resolved === undefined
				? binding
				: { ...resolved, localName: binding.localName, range: binding.range };
		},
	};
}
