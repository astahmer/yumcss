import { dirname, isAbsolute, resolve } from "node:path";
import { ensureImport } from "../../../shared.ts";
import type { AliasInfo } from "./project.ts";

export interface PandaProjectSourceFile {
	readonly path: string;
	readonly source: string;
}

export interface PandaStylesheetImportChange {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}

const absolutePath = (projectRoot: string, path: string): string =>
	isAbsolute(path) ? path : resolve(projectRoot, path);

const stylesheetImportTarget = (
	projectRoot: string,
	file: string,
	specifier: string,
	aliasInfo: AliasInfo | undefined,
): string | undefined => {
	if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
	if (
		aliasInfo !== undefined &&
		aliasInfo.alias !== "" &&
		specifier.startsWith(`${aliasInfo.alias}/`)
	)
		return resolve(projectRoot, aliasInfo.targetRoot, specifier.slice(aliasInfo.alias.length + 1));
	return undefined;
};

const javascriptStylesheetImports = /^[ \t]*import\s*["']([^"']+)["']\s*;?[ \t]*$/gmu;
const cssStylesheetImports = /^[ \t]*@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;?[ \t]*$/gmu;

const stylesheetImportMatches = (
	source: string,
	cssFile: boolean,
): IterableIterator<RegExpMatchArray> =>
	source.matchAll(cssFile ? cssStylesheetImports : javascriptStylesheetImports);

const isCssFile = (path: string): boolean => path.endsWith(".css");

const isCodeFile = (path: string): boolean => /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/u.test(path);

const importedStylesheetPaths = (
	input: { readonly projectRoot: string; readonly aliasInfo?: AliasInfo },
	file: PandaProjectSourceFile,
	cssFile: boolean,
): readonly string[] => {
	const absoluteFile = absolutePath(input.projectRoot, file.path);
	return [...stylesheetImportMatches(file.source, cssFile)].flatMap((match) => {
		const target = stylesheetImportTarget(
			input.projectRoot,
			absoluteFile,
			match[1] ?? "",
			input.aliasInfo,
		);
		return target === undefined ? [] : [target];
	});
};

const pandaStylesheetCssPaths = (input: {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly files: readonly PandaProjectSourceFile[];
	readonly aliasInfo?: AliasInfo;
}): ReadonlySet<string> => {
	const stylesheetPath = resolve(input.projectRoot, input.outputDirectory, "styles.css");
	const cssFiles = input.files.filter((file) =>
		isCssFile(absolutePath(input.projectRoot, file.path)),
	);
	const connectedPaths = new Set(
		cssFiles
			.filter((file) => importedStylesheetPaths(input, file, true).includes(stylesheetPath))
			.map((file) => absolutePath(input.projectRoot, file.path)),
	);
	let changed = true;
	while (changed) {
		changed = false;
		for (const file of cssFiles) {
			const path = absolutePath(input.projectRoot, file.path);
			if (connectedPaths.has(path)) continue;
			if (!importedStylesheetPaths(input, file, true).some((target) => connectedPaths.has(target)))
				continue;
			connectedPaths.add(path);
			changed = true;
		}
	}
	return connectedPaths;
};

const javascriptImportersOfCss = (
	input: {
		readonly projectRoot: string;
		readonly files: readonly PandaProjectSourceFile[];
		readonly aliasInfo?: AliasInfo;
	},
	cssPaths: ReadonlySet<string>,
): readonly PandaProjectSourceFile[] =>
	input.files.filter((file) => {
		const path = absolutePath(input.projectRoot, file.path);
		return (
			!isCssFile(path) &&
			isCodeFile(path) &&
			importedStylesheetPaths(input, file, false).some((target) => cssPaths.has(target))
		);
	});

export function hasTargetStylesheetImport(
	files: readonly PandaProjectSourceFile[],
	targetImport: string,
): boolean {
	return files.some(
		(file) =>
			!isCssFile(file.path) &&
			[...stylesheetImportMatches(file.source, false)].some((match) => match[1] === targetImport),
	);
}

export function hasPandaStylesheetImportReference(input: {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly files: readonly PandaProjectSourceFile[];
	readonly stylesheetExists: boolean;
	readonly aliasInfo?: AliasInfo;
}): boolean {
	if (!input.stylesheetExists) return false;
	const stylesheetPath = resolve(input.projectRoot, input.outputDirectory, "styles.css");
	return (
		input.files.some((file) => {
			const path = absolutePath(input.projectRoot, file.path);
			return (
				!isCssFile(path) &&
				isCodeFile(path) &&
				importedStylesheetPaths(input, file, false).includes(stylesheetPath)
			);
		}) || pandaStylesheetCssPaths(input).size > 0
	);
}

export function hasPandaStylesheetImport(input: {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly files: readonly PandaProjectSourceFile[];
	readonly stylesheetExists: boolean;
	readonly aliasInfo?: AliasInfo;
}): boolean {
	if (!input.stylesheetExists) return false;
	const cssPaths = pandaStylesheetCssPaths(input);
	return (
		hasPandaStylesheetImportReference(input) &&
		(input.files.some((file) => {
			const path = absolutePath(input.projectRoot, file.path);
			return (
				!isCssFile(path) &&
				isCodeFile(path) &&
				importedStylesheetPaths(input, file, false).includes(
					resolve(input.projectRoot, input.outputDirectory, "styles.css"),
				)
			);
		}) ||
			javascriptImportersOfCss(input, cssPaths).length > 0)
	);
}

export function rewritePandaStylesheetImports(input: {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly files: readonly PandaProjectSourceFile[];
	readonly targetImport: string;
	readonly preservePandaStylesheet: boolean;
	readonly stylesheetExists: boolean;
	readonly aliasInfo?: AliasInfo;
}): readonly PandaStylesheetImportChange[] {
	if (!input.stylesheetExists) return [];
	const stylesheetPath = resolve(input.projectRoot, input.outputDirectory, "styles.css");
	const cssPaths = pandaStylesheetCssPaths(input);
	const cssImporters = javascriptImportersOfCss(input, cssPaths);
	const canReplaceCssImports = cssImporters.length > 0;
	const changedSources = new Map<string, string>();
	for (const file of input.files) {
		const absoluteFile = absolutePath(input.projectRoot, file.path);
		const cssFile = isCssFile(absoluteFile);
		if (!cssFile && !isCodeFile(absoluteFile)) continue;
		let matched = false;
		let targetImportInserted = false;
		const targetAlreadyPresent = hasTargetStylesheetImport([file], input.targetImport);
		const importPattern = cssFile ? cssStylesheetImports : javascriptStylesheetImports;
		const importedSource = file.source.replace(importPattern, (statement, specifier: string) => {
			const importedPath = stylesheetImportTarget(
				input.projectRoot,
				absoluteFile,
				specifier,
				input.aliasInfo,
			);
			if (importedPath !== stylesheetPath) return statement;
			matched = true;
			if (cssFile) return input.preservePandaStylesheet || !canReplaceCssImports ? statement : "";
			if (input.preservePandaStylesheet) {
				if (targetAlreadyPresent || targetImportInserted) return statement;
				targetImportInserted = true;
				return `${statement}\nimport "${input.targetImport}";`;
			}
			if (targetAlreadyPresent || targetImportInserted) return "";
			targetImportInserted = true;
			return `import "${input.targetImport}";`;
		});
		if (matched && importedSource !== file.source) changedSources.set(absoluteFile, importedSource);
	}

	for (const importer of cssImporters) {
		const path = absolutePath(input.projectRoot, importer.path);
		const source = changedSources.get(path) ?? importer.source;
		if (hasTargetStylesheetImport([{ path, source }], input.targetImport)) continue;
		const content = ensureImport(source, `import "${input.targetImport}";`);
		if (content !== source) changedSources.set(path, content);
	}

	return [...changedSources].map(([path, content]) => ({
		path,
		content,
		expectedContent:
			input.files.find((file) => absolutePath(input.projectRoot, file.path) === path)?.source ?? "",
	}));
}
