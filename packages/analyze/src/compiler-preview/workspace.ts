import { realpathSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createSourceWorkspace, type SourceWorkspace } from "pandwind/source/workspace";

const DEFAULT_PATTERNS = ["**/*"] as const;

const GENERATED_DIRECTORIES = new Set([
	".astro",
	".next",
	".output",
	".svelte-kit",
	".turbo",
	"build",
	"coverage",
	"dist",
	"storybook-static",
]);

export interface CompilerPreviewFile {
	readonly path: string;
	readonly bytes: number;
}

export interface CompilerPreviewWorkspace {
	readonly root: string;
	files(): readonly CompilerPreviewFile[];
	read(file: string): {
		readonly path: string;
		readonly absolutePath: string;
		readonly source: string;
	};
}

export interface CompilerPreviewWorkspaceOptions {
	readonly sourceWorkspace?: SourceWorkspace;
}

const isGeneratedPath = (file: string): boolean =>
	file.split(/[\\/]/u).some((segment) => GENERATED_DIRECTORIES.has(segment));

const isTypeDeclaration = (file: string): boolean => /\.d\.(?:ts|mts|cts)$/u.test(file);

const isInside = (root: string, file: string): boolean => {
	const path = relative(root, file);
	return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

export const createCompilerPreviewWorkspace = (
	rootPath: string,
	options: CompilerPreviewWorkspaceOptions = {},
): CompilerPreviewWorkspace => {
	const root = realpathSync(resolve(rootPath));
	if (!statSync(root).isDirectory())
		throw new Error(`Compiler Preview root is not a directory: ${root}`);
	const sourceWorkspace = options.sourceWorkspace ?? createSourceWorkspace();
	const paths = sourceWorkspace
		.files(DEFAULT_PATTERNS, root, { exclude: isGeneratedPath })
		.filter((path) => !isTypeDeclaration(path));
	const pathSet = new Set(paths);
	const files = paths.flatMap((path) => {
		try {
			const bytes = statSync(path).size;
			return [{ path: relative(root, path).split(sep).join("/"), bytes }];
		} catch {
			return [];
		}
	});

	return {
		root,
		files: () => files,
		read(file) {
			if (file === "" || isAbsolute(file)) throw new Error("Choose a project-relative source file");
			const absolutePath = resolve(root, file);
			const normalizedPath = relative(root, absolutePath).split(sep).join("/");
			if (normalizedPath !== file || !pathSet.has(absolutePath))
				throw new Error("Source file is outside the supported project workspace");
			const realPath = realpathSync(absolutePath);
			if (!isInside(root, realPath))
				throw new Error("Source file resolves outside the project workspace");
			return { path: normalizedPath, absolutePath, source: readFileSync(realPath, "utf8") };
		},
	};
};
