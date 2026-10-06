import { SourceBindings, SOURCE_SCANNER_SERVICE } from "yumcss/source";
import type { AdapterFileChange } from "./adapter-contract.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../path-utils.ts";

interface ProjectModuleRenameRequest {
	readonly file: string;
	readonly importSpecifierExtension: string;
	readonly root?: string;
	readonly listFiles?: (root: string) => readonly string[];
	readonly readFile?: (file: string) => string | undefined;
	readonly resolveModule?: (importer: string, specifier: string) => string | undefined;
}

export type ProjectModuleRenamePlan =
	| { readonly status: "ready"; readonly fileChanges: readonly AdapterFileChange[] }
	| { readonly status: "blocked"; readonly reason: string };

const scriptSuffixes = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

const projectPath = (root: string, file: string) =>
	joinDocumentPath(isAbsoluteDocumentPath(file) ? file : joinDocumentPath(root, file));

const projectRelativePath = (root: string, file: string) =>
	isAbsoluteDocumentPath(file) ? relativeDocumentPath(root, file) : joinDocumentPath(file);

const stripScriptSuffix = (file: string) => {
	const suffix = scriptSuffixes.find((candidate) => file.endsWith(candidate));
	return suffix === undefined ? file : file.slice(0, -suffix.length);
};

const mayAliasSourceFile = (sourceFile: string, specifier: string) => {
	if (specifier.startsWith(".")) return false;
	const specifierPath = specifier.split(/[?#]/u, 1)[0] ?? specifier;
	if (/^(?:@\/|~\/|#)/u.test(specifierPath)) return true;
	const moduleLeaf = stripScriptSuffix(sourceFile).split("/").at(-1);
	const specifierLeaf = stripScriptSuffix(specifierPath).split("/").at(-1);
	return moduleLeaf !== undefined && moduleLeaf === specifierLeaf;
};

const relativeModule = (
	request: ProjectModuleRenameRequest,
	root: string,
	importer: string,
	specifier: string,
) => {
	const resolvedByHost = request.resolveModule?.(importer, specifier);
	if (resolvedByHost !== undefined) return projectPath(root, resolvedByHost);
	if (!specifier.startsWith(".")) return undefined;
	const importerPath = projectRelativePath(root, importer);
	const base = joinDocumentPath(
		dirnameDocumentPath(importerPath),
		specifier.split(/[?#]/u, 1)[0] ?? specifier,
	);
	const candidates = [
		base,
		...scriptSuffixes.map((suffix) => `${base}${suffix}`),
		...scriptSuffixes.map((suffix) => joinDocumentPath(base, `index${suffix}`)),
	];
	for (const candidate of candidates)
		if (request.readFile?.(candidate) !== undefined) return projectPath(root, candidate);
	return undefined;
};

export const planProjectModuleRename = (
	request: ProjectModuleRenameRequest,
): ProjectModuleRenamePlan => {
	if (
		request.root === undefined ||
		request.listFiles === undefined ||
		request.readFile === undefined
	)
		return {
			status: "blocked",
			reason:
				"a complete project file index is required to update imports before renaming this module",
		};
	const root = joinDocumentPath(request.root);
	const sourceFile = projectPath(root, request.file);
	const sourceFiles = request.listFiles(root);
	if (!sourceFiles.some((file) => projectPath(root, file) === sourceFile))
		return {
			status: "blocked",
			reason: "the source module is not present in the project file index",
		};
	const sourceBase = stripScriptSuffix(sourceFile);
	const importTarget = `${sourceBase}${request.importSpecifierExtension}`;
	const changes = new Map<string, AdapterFileChange>();
	for (const listedFile of sourceFiles) {
		const consumerFile = projectPath(root, listedFile);
		if (consumerFile === sourceFile || !SOURCE_SCANNER_SERVICE.isSupportedFile(consumerFile))
			continue;
		const source = request.readFile(listedFile);
		if (source === undefined)
			return {
				status: "blocked",
				reason: `the indexed project file ${listedFile} could not be read safely`,
			};
		let document;
		try {
			document = SOURCE_SCANNER_SERVICE.scan({ file: listedFile, source, root });
		} catch {
			return {
				status: "blocked",
				reason: `the indexed project file ${listedFile} could not be parsed safely`,
			};
		}
		if (document.diagnostics.some((diagnostic) => diagnostic.kind === "parse"))
			return {
				status: "blocked",
				reason: `the indexed project file ${listedFile} has parse errors, so its imports cannot be rewritten safely`,
			};
		let references: ReturnType<typeof SourceBindings.fromDocument>["moduleReferences"];
		try {
			references = SourceBindings.fromDocument(document.document).moduleReferences;
		} catch {
			return {
				status: "blocked",
				reason: `the indexed project file ${listedFile} has no usable import index`,
			};
		}
		let code = source;
		let changed = false;
		for (const reference of references.toSorted(
			(left, right) => right.range.start - left.range.start,
		)) {
			const resolved = relativeModule(request, root, listedFile, reference.source);
			if (resolved === undefined && mayAliasSourceFile(sourceFile, reference.source))
				return {
					status: "blocked",
					reason: `project alias ${reference.source} is unresolved; inject a resolver before renaming this module`,
				};
			if (resolved !== sourceFile) continue;
			if (
				reference.range.start < 0 ||
				reference.range.end > source.length ||
				reference.range.start >= reference.range.end
			)
				return {
					status: "blocked",
					reason: `the import range in ${listedFile} is invalid`,
				};
			const quote = source[reference.range.start];
			if ((quote !== '"' && quote !== "'") || source[reference.range.end - 1] !== quote)
				return {
					status: "blocked",
					reason: `the import in ${listedFile} cannot be rewritten without changing its syntax`,
				};
			const relativePath = relativeDocumentPath(dirnameDocumentPath(consumerFile), importTarget);
			const nextSpecifier = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
			code = `${code.slice(0, reference.range.start)}${quote}${nextSpecifier}${quote}${code.slice(reference.range.end)}`;
			changed = true;
		}
		if (changed) {
			const path = projectRelativePath(root, listedFile);
			changes.set(path, { path, content: code, expectedContent: source });
		}
	}
	return { status: "ready", fileChanges: [...changes.values()] };
};
