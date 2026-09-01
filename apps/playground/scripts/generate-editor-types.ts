import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(playgroundRoot, "../..");
const packageJsonPath = require.resolve("pandwind/package.json", { paths: [playgroundRoot] });
const packageRoot = dirname(packageJsonPath);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
	name: string;
	exports?: Record<string, ExportTarget>;
};
const outputRoot = resolve(playgroundRoot, "src/generated/pandwind");
const dependencyOutputRoot = resolve(playgroundRoot, "src/generated/dependencies");
const sourceDeclarationFiles = ["types/selectors.d.ts"] as const;
const editorPackageSpecifiers = [
	"@pandacss/dev",
	"@emotion/css",
	"@emotion/react",
	"@compiled/react",
	"@vanilla-extract/css",
	"@treat/webpack",
	"@tokenami/css",
	"goober",
	"@stitches/react",
	"react-jss",
	"aphrodite",
	"style9",
	"stylex",
	"@chakra-ui/react",
	"@mui/material",
	"@mantine/core",
	"styled-components",
	"next-yak",
	"solid-styled-components",
	"vue3-styled-components",
	"react-fela",
	"fela",
	"@pandacss/config",
	"@tokenami/config",
	"@unocss/config",
	"@unocss/core",
	"unocss",
	"tailwindcss",
	"jss",
] as const;
const workspaceResolutionRoots = [
	packageRoot,
	playgroundRoot,
	repositoryRoot,
	...(["apps", "packages"] as const).flatMap((directory) =>
		readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => resolve(repositoryRoot, directory, entry.name)),
	),
];

const entryExportKeys = [".", "./css", "./design", "./tw", "./cx", "./types/typings"] as const;

type ExportTarget = string | readonly ExportTarget[] | { [condition: string]: ExportTarget };

const findExportPath = (target: ExportTarget | undefined): string | undefined => {
	if (typeof target === "string") return target;
	if (target === undefined) return undefined;
	if (Array.isArray(target)) {
		for (const candidate of target) {
			const path = findExportPath(candidate);
			if (path !== undefined) return path;
		}
		return undefined;
	}
	for (const condition of ["types", "import", "require", "default"]) {
		const path = findExportPath(target[condition]);
		if (path !== undefined) return path;
	}
	return undefined;
};

const resolveExport = (key: (typeof entryExportKeys)[number]): string => {
	const path = findExportPath(packageJson.exports?.[key]);
	if (path === undefined) {
		throw new Error(`pandwind does not expose a usable type entry for ${key}`);
	}
	return resolve(packageRoot, path);
};

const normalizeDeclarationImports = (content: string): string =>
	content.replace(/(["'])(\.\.?\/[^"']+)\1/g, (match, quote: string, path: string) => {
		if (path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts")) {
			return match;
		}
		const declarationPath = path.endsWith(".mts")
			? `${path.slice(0, -4)}.d.mts`
			: path.endsWith(".cts")
				? `${path.slice(0, -4)}.d.cts`
				: path.replace(/\.(?:[cm]?js|tsx?)$/, ".d.ts");
		const normalizedPath = declarationPath === path ? `${path}.d.ts` : declarationPath;
		return `${quote}${normalizedPath}${quote}`;
	});

const generatedHeader = "// Generated from the workspace-linked pandwind package. Do not edit.\n";
let activeDependencyOutputRoot = dependencyOutputRoot;
let activeDependencyModuleEntries = new Map<string, string>();

const cleanGeneratedFiles = (root: string): void => {
	mkdirSync(root, { recursive: true });
	for (const entry of readdirSync(root, { withFileTypes: true, encoding: "utf8" })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) rmSync(path, { recursive: true, force: true });
		else rmSync(path, { force: true });
	}
};

const packageNameFromSpecifier = (specifier: string): string =>
	specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;

const packageSpecifiers = (content: string): string[] => {
	const specifiers = new Set<string>();
	const declarationCode = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
	const imports = [
		...declarationCode.matchAll(/^\s*(?:import|export)\b[^\n;]*\bfrom\s*["']([^"']+)["']/gm),
		...declarationCode.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
	];
	for (const match of imports) {
		const specifier = match[1]!;
		if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
			specifiers.add(packageNameFromSpecifier(specifier));
		}
	}
	return [...specifiers];
};

const relativeSpecifiers = (content: string): string[] => {
	const declarationCode = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
	const specifiers = new Set<string>();
	const imports = [
		...declarationCode.matchAll(/^\s*(?:import|export)\b[^\n;]*\bfrom\s*["']([^"']+)["']/gm),
		...declarationCode.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
	];
	for (const match of imports) {
		if (match[1]?.startsWith(".")) specifiers.add(match[1]);
	}
	return [...specifiers];
};

const declarationFiles = (root: string): string[] => {
	const files: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (/\.d\.(?:ts|mts|cts)$/.test(entry.name)) files.push(path);
		}
	};
	visit(root);
	return files;
};

const resolveDependencyPackage = (name: string, resolutionRoots: string[]): string => {
	try {
		const packagePath = require.resolve(`${name}/package.json`, { paths: resolutionRoots });
		return dirname(packagePath);
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!(error as NodeJS.ErrnoException).code?.includes("PACKAGE_PATH_NOT_EXPORTED")
		) {
			throw error;
		}
		const packagePathMatch = error.message.match(/ in (.+\/package\.json)$/u);
		if (packagePathMatch?.[1] !== undefined && existsSync(packagePathMatch[1])) {
			return dirname(packagePathMatch[1]);
		}
		for (const root of resolutionRoots) {
			const candidate = join(root, "node_modules", ...name.split("/"), "package.json");
			if (existsSync(candidate) && statSync(candidate).isFile()) return dirname(candidate);
		}
		let directory = dirname(require.resolve(name, { paths: resolutionRoots }));
		while (directory !== dirname(directory)) {
			const candidate = join(directory, "package.json");
			try {
				const candidatePackage = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
				if (candidatePackage.name === name) return directory;
			} catch {
				// Continue toward the package root when an entry directory has no manifest.
			}
			directory = dirname(directory);
		}
		throw error;
	}
};

const resolveDeclarationFile = (sourceFile: string, specifier: string): string | undefined => {
	const resolved = resolve(dirname(sourceFile), specifier);
	const withoutSourceExtension = resolved.replace(/\.(?:[cm]?js|tsx?)$/, "");
	const candidates = [
		...(/\.d\.(?:ts|mts|cts)$/.test(resolved) ? [resolved] : []),
		`${withoutSourceExtension}.d.ts`,
		`${withoutSourceExtension}.d.mts`,
		`${withoutSourceExtension}.d.cts`,
		join(resolved, "index.d.ts"),
		join(resolved, "index.d.mts"),
		join(resolved, "index.d.cts"),
	];
	return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};

const declarationEntry = (packageJson: {
	types?: string;
	typings?: string;
	exports?: Record<string, ExportTarget>;
}): string | undefined => {
	const entry =
		packageJson.types ?? packageJson.typings ?? findExportPath(packageJson.exports?.["."]);
	return entry !== undefined && /\.d\.(?:ts|mts|cts)$/.test(entry) ? entry : undefined;
};

const definitelyTypedName = (name: string): string | undefined => {
	if (name.startsWith("@types/") || name.startsWith("@")) return undefined;
	return `@types/${name}`;
};

const copyDependencyDeclarations = (name: string, resolutionRoots: string[]): void => {
	if (activeDependencyModuleEntries.has(name)) return;
	let sourceRoot = resolveDependencyPackage(name, resolutionRoots);
	let dependencyPackage = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8")) as {
		types?: string;
		typings?: string;
		exports?: Record<string, ExportTarget>;
	};
	let typeEntry = declarationEntry(dependencyPackage);
	if (typeEntry === undefined) {
		const typePackageName = definitelyTypedName(name);
		if (typePackageName !== undefined) {
			try {
				sourceRoot = resolveDependencyPackage(typePackageName, [sourceRoot, ...resolutionRoots]);
				dependencyPackage = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
				typeEntry = declarationEntry(dependencyPackage);
			} catch {
				// The runtime package may legitimately have no bundled declarations.
			}
		}
	}
	if (typeEntry === undefined) {
		throw new Error(`Cannot mount ${name}: package does not publish declarations`);
	}
	const targetRoot = join(activeDependencyOutputRoot, name);
	const sourceEntry = resolve(sourceRoot, typeEntry);
	const targetEntry = join(targetRoot, typeEntry).slice(activeDependencyOutputRoot.length + 1);
	activeDependencyModuleEntries.set(name, targetEntry);
	const visited = new Set<string>();
	const visit = (sourceFile: string): void => {
		if (visited.has(sourceFile)) return;
		visited.add(sourceFile);
		const relativePath = sourceFile.slice(sourceRoot.length + 1);
		const targetFile = join(targetRoot, relativePath);
		mkdirSync(dirname(targetFile), { recursive: true });
		writeFileSync(
			targetFile,
			generatedHeader + normalizeDeclarationImports(readFileSync(sourceFile, "utf8")),
		);
		const source = readFileSync(sourceFile, "utf8");
		for (const specifier of relativeSpecifiers(source)) {
			const importedFile = resolveDeclarationFile(sourceFile, specifier);
			if (importedFile !== undefined) visit(importedFile);
		}
		for (const importedName of packageSpecifiers(source)) {
			copyDependencyDeclarations(importedName, [sourceRoot, ...resolutionRoots]);
		}
	};
	if (!existsSync(sourceEntry))
		throw new Error(`Cannot mount ${name}: missing declaration entry ${typeEntry}`);
	visit(sourceEntry);
};

const generateDependencyModules = (): void => {
	const modules = [...activeDependencyModuleEntries.entries()]
		.map(
			([name, entry]) => `declare module ${JSON.stringify(name)} { export * from "./${entry}"; }`,
		)
		.join("\n");
	writeFileSync(join(activeDependencyOutputRoot, "modules.d.ts"), generatedHeader + modules + "\n");
};

const generate = (root: string, dependenciesRoot: string): void => {
	activeDependencyOutputRoot = dependenciesRoot;
	activeDependencyModuleEntries = new Map();
	mkdirSync(root, { recursive: true });
	cleanGeneratedFiles(root);
	cleanGeneratedFiles(dependenciesRoot);

	const sourceRoot = resolve(packageRoot, "src");
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsc",
			"--allowImportingTsExtensions",
			"--declaration",
			"--emitDeclarationOnly",
			"--forceConsistentCasingInFileNames",
			"--lib",
			"ES2023",
			"--module",
			"ESNext",
			"--moduleResolution",
			"Bundler",
			"--noEmitOnError",
			"--outDir",
			root,
			"--rootDir",
			sourceRoot,
			"--skipLibCheck",
			"--target",
			"ES2023",
			...entryExportKeys.map(resolveExport),
			resolve(sourceRoot, "types/selectors.d.ts"),
		],
		{ cwd: repositoryRoot, stdio: "inherit" },
	);
	for (const file of sourceDeclarationFiles) {
		const source = resolve(sourceRoot, file);
		const target = join(root, file);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, normalizeDeclarationImports(readFileSync(source, "utf8")));
	}

	const rewrite = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) rewrite(path);
			else if (path.endsWith(".d.ts")) {
				writeFileSync(
					path,
					generatedHeader + normalizeDeclarationImports(readFileSync(path, "utf8")),
				);
			}
		}
	};
	rewrite(root);
	const dependencies = new Set<string>();
	for (const file of declarationFiles(root)) {
		for (const name of packageSpecifiers(readFileSync(file, "utf8"))) dependencies.add(name);
	}
	for (const name of [...dependencies, ...editorPackageSpecifiers]) {
		if (name === packageJson.name) continue;
		try {
			copyDependencyDeclarations(name, workspaceResolutionRoots);
		} catch (error) {
			if (error instanceof Error && (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
				continue;
			}
			if (error instanceof Error && error.message.includes("does not publish declarations")) {
				continue;
			}
			throw error;
		}
	}
	generateDependencyModules();
};

const main = (): void => {
	const check = process.argv.includes("--check");
	if (!check) {
		generate(outputRoot, dependencyOutputRoot);
		return;
	}

	const temporaryRoot = resolve("/tmp", `pandwind-playground-types-${process.pid}`);
	const temporaryDependenciesRoot = resolve(
		"/tmp",
		`pandwind-playground-dependencies-${process.pid}`,
	);
	generate(temporaryRoot, temporaryDependenciesRoot);
	const expected = readdirSync(temporaryRoot, { recursive: true, encoding: "utf8" })
		.filter((path): path is string => typeof path === "string")
		.filter((path) => path.endsWith(".d.ts"))
		.sort();
	const current = readdirSync(outputRoot, { recursive: true, encoding: "utf8" })
		.filter((path): path is string => typeof path === "string")
		.filter((path) => path.endsWith(".d.ts"))
		.sort();
	const same =
		expected.length === current.length &&
		expected.every(
			(path) =>
				readFileSync(join(temporaryRoot, path), "utf8") ===
				readFileSync(join(outputRoot, path), "utf8"),
		);
	const expectedDependencies = readdirSync(temporaryDependenciesRoot, {
		recursive: true,
		encoding: "utf8",
	})
		.filter((path): path is string => typeof path === "string")
		.filter((path) => path.endsWith(".d.ts"))
		.sort();
	const currentDependencyPaths = readdirSync(dependencyOutputRoot, {
		recursive: true,
		encoding: "utf8",
	})
		.filter((path): path is string => typeof path === "string")
		.filter((path) => path.endsWith(".d.ts"))
		.sort();
	const dependenciesSame =
		expectedDependencies.length === currentDependencyPaths.length &&
		expectedDependencies.every(
			(path, index) =>
				path === currentDependencyPaths[index] &&
				readFileSync(join(temporaryDependenciesRoot, path), "utf8") ===
					readFileSync(join(dependencyOutputRoot, path), "utf8"),
		);
	if (!same || !dependenciesSame)
		throw new Error("Generated playground declarations are stale. Run `pnpm editor:types`.");
};

main();
