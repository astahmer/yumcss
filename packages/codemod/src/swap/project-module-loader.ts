/** Host-project module loading boundary used by optional official integrations. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export interface ProjectModuleLoader {
	importPackage<T>(packageName: string, root: string): Promise<T | undefined>;
	importFile<T>(file: string): Promise<T | undefined>;
}

function isUnavailableModule(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = "code" in error ? (error as Error & { code?: string }).code : undefined;
	return (
		code === "ENOENT" ||
		code === "MODULE_NOT_FOUND" ||
		code === "ERR_MODULE_NOT_FOUND" ||
		code === "ERR_PACKAGE_PATH_NOT_EXPORTED" ||
		code === "ERR_INVALID_PACKAGE_CONFIG" ||
		code === "ERR_INVALID_MODULE_SPECIFIER" ||
		code === "ERR_UNSUPPORTED_DIR_IMPORT" ||
		code === "ERR_UNKNOWN_FILE_EXTENSION"
	);
}

async function importBundledProjectFile<T>(file: string): Promise<T | undefined> {
	const temporaryDirectory = mkdtempSync(join(dirname(file), ".pandwind-codemod-"));
	try {
		const outputFile = join(temporaryDirectory, "module.mjs");
		await build({
			absWorkingDir: dirname(file),
			bundle: true,
			entryPoints: [file],
			format: "esm",
			logLevel: "silent",
			outfile: outputFile,
			packages: "external",
			platform: "node",
		});
		return (await import(/* @vite-ignore */ pathToFileURL(outputFile).href)) as T;
	} finally {
		rmSync(temporaryDirectory, { force: true, recursive: true });
	}
}

function packageNames(root: string): readonly string[] {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
		const dependencies = parsed as {
			dependencies?: unknown;
			devDependencies?: unknown;
			optionalDependencies?: unknown;
			peerDependencies?: unknown;
		};
		return [
			...Object.keys(asRecord(dependencies.dependencies)),
			...Object.keys(asRecord(dependencies.devDependencies)),
			...Object.keys(asRecord(dependencies.optionalDependencies)),
			...Object.keys(asRecord(dependencies.peerDependencies)),
		];
	} catch {
		return [];
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

interface NodeRequire {
	resolve(specifier: string): string;
}

type CreateNodeRequire = (file: string) => NodeRequire;

function resolvePackage(
	importer: NodeRequire,
	packageName: string,
	root: string,
	createNodeRequire: CreateNodeRequire,
): string | undefined {
	try {
		return importer.resolve(packageName);
	} catch (error) {
		if (!isUnavailableModule(error)) throw error;
	}
	for (const dependency of packageNames(root)) {
		let dependencyEntry: string;
		try {
			dependencyEntry = importer.resolve(dependency);
		} catch (error) {
			if (isUnavailableModule(error)) continue;
			throw error;
		}
		try {
			return createNodeRequire(dependencyEntry).resolve(packageName);
		} catch (error) {
			if (isUnavailableModule(error)) continue;
			throw error;
		}
	}
	return undefined;
}

/** Node implementation that resolves packages from the migrated project, not Pandwind itself. */
export class NodeProjectModuleLoader implements ProjectModuleLoader {
	async importPackage<T>(packageName: string, root: string): Promise<T | undefined> {
		try {
			const { createRequire } = await import(/* @vite-ignore */ "node:module");
			const { join } = await import(/* @vite-ignore */ "node:path");
			const { pathToFileURL } = await import(/* @vite-ignore */ "node:url");
			const importer = createRequire(join(root, "package.json"));
			const resolved = resolvePackage(importer, packageName, root, createRequire);
			if (resolved === undefined) return undefined;
			return (await import(/* @vite-ignore */ pathToFileURL(resolved).href)) as T;
		} catch (error) {
			if (isUnavailableModule(error)) return undefined;
			throw error;
		}
	}

	async importFile<T>(file: string): Promise<T | undefined> {
		if (!existsSync(file)) return undefined;
		try {
			return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
		} catch (error) {
			if (!isUnavailableModule(error)) throw error;
			try {
				return await importBundledProjectFile<T>(file);
			} catch (bundleError) {
				if (isUnavailableModule(bundleError)) return undefined;
				throw bundleError;
			}
		}
	}
}

export const NODE_PROJECT_MODULE_LOADER: ProjectModuleLoader = new NodeProjectModuleLoader();
