/** Host-project module loading boundary used by optional official integrations. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectModuleLoader {
	importPackage<T>(packageName: string, root: string): Promise<T | undefined>;
	importFile<T>(file: string): Promise<T | undefined>;
}

function isMissingModule(error: unknown): boolean {
	return (
		(error instanceof Error &&
			"code" in error &&
			(error as Error & { code?: string }).code === "MODULE_NOT_FOUND") ||
		(error instanceof Error &&
			"code" in error &&
			(error as Error & { code?: string }).code === "ERR_MODULE_NOT_FOUND")
	);
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
		if (!isMissingModule(error)) throw error;
	}
	for (const dependency of packageNames(root)) {
		let dependencyEntry: string;
		try {
			dependencyEntry = importer.resolve(dependency);
		} catch (error) {
			if (isMissingModule(error)) continue;
			throw error;
		}
		try {
			return createNodeRequire(dependencyEntry).resolve(packageName);
		} catch (error) {
			if (isMissingModule(error)) continue;
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
			if (isMissingModule(error)) return undefined;
			throw error;
		}
	}

	async importFile<T>(file: string): Promise<T | undefined> {
		try {
			const { pathToFileURL } = await import(/* @vite-ignore */ "node:url");
			return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
		} catch (error) {
			if (isMissingModule(error)) return undefined;
			throw error;
		}
	}
}

export const NODE_PROJECT_MODULE_LOADER: ProjectModuleLoader = new NodeProjectModuleLoader();
