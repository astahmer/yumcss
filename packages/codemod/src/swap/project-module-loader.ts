/** Host-project module loading boundary used by optional official integrations. */
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

/** Node implementation that resolves packages from the migrated project, not Pandwind itself. */
export class NodeProjectModuleLoader implements ProjectModuleLoader {
	async importPackage<T>(packageName: string, root: string): Promise<T | undefined> {
		try {
			const { createRequire } = await import(/* @vite-ignore */ "node:module");
			const { join } = await import(/* @vite-ignore */ "node:path");
			const { pathToFileURL } = await import(/* @vite-ignore */ "node:url");
			const importer = createRequire(join(root, "package.json"));
			const resolved = importer.resolve(packageName);
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
