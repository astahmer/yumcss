import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

const entryExportKeys = [".", "./css", "./design", "./tw", "./cx", "./types/typings"] as const;

type ExportTarget = string | { [condition: string]: ExportTarget };

const findExportPath = (target: ExportTarget | undefined): string | undefined => {
	if (typeof target === "string") return target;
	if (target === undefined) return undefined;
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
		if (path.endsWith(".d.ts")) return match;
		const declarationPath = path.replace(/\.(?:[cm]?js|tsx?)$/, ".d.ts");
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

const declarationFiles = (root: string): string[] => {
	const files: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (entry.name.endsWith(".d.ts")) files.push(path);
		}
	};
	visit(root);
	return files;
};

const resolveDependencyPackage = (name: string, resolutionRoots: string[]): string => {
	const packagePath = require.resolve(`${name}/package.json`, { paths: resolutionRoots });
	return dirname(packagePath);
};

const copyDependencyDeclarations = (name: string, resolutionRoots: string[]): void => {
	if (activeDependencyModuleEntries.has(name)) return;
	const sourceRoot = resolveDependencyPackage(name, resolutionRoots);
	const dependencyPackage = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8")) as {
		types?: string;
		typings?: string;
	};
	const typeEntry = dependencyPackage.types ?? dependencyPackage.typings;
	if (typeEntry === undefined) {
		throw new Error(`Cannot mount ${name}: package does not publish declarations`);
	}
	const targetRoot = join(activeDependencyOutputRoot, name);
	for (const sourceFile of declarationFiles(sourceRoot)) {
		const relativePath = sourceFile.slice(sourceRoot.length + 1);
		const targetFile = join(targetRoot, relativePath);
		mkdirSync(dirname(targetFile), { recursive: true });
		writeFileSync(
			targetFile,
			generatedHeader + normalizeDeclarationImports(readFileSync(sourceFile, "utf8")),
		);
	}
	const targetEntry = join(targetRoot, typeEntry).slice(activeDependencyOutputRoot.length + 1);
	activeDependencyModuleEntries.set(name, targetEntry);
	for (const sourceFile of declarationFiles(sourceRoot)) {
		for (const importedName of packageSpecifiers(readFileSync(sourceFile, "utf8"))) {
			copyDependencyDeclarations(importedName, [sourceRoot, ...resolutionRoots]);
		}
	}
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
	for (const name of dependencies) {
		if (name === packageJson.name) continue;
		copyDependencyDeclarations(name, [packageRoot]);
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
