import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createUnplugin } from "unplugin";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import type {
	AdapterMigrationOptions,
	AdapterMigrationResult,
} from "./adapter-migration-contract.ts";
import type { AdapterGeneratedFile } from "./adapter-contract.ts";
import { STYLE_MIGRATION_USE_CASE } from "./adapter-migration.ts";
import type { AdapterCapabilityMode } from "./capabilities.ts";
import type { StyleLoweringRegistry } from "./lowering.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type { StyleDialectResolver } from "./style-systems.ts";

export interface VirtualMigrationResidual {
	readonly file: string;
	readonly route: {
		readonly from: AdapterMigrationOptions["from"];
		readonly to: AdapterMigrationOptions["to"];
	};
	readonly residuals: AdapterMigrationResult["residuals"];
}

export interface PandwindMigrateOptions {
	readonly from: AdapterMigrationOptions["from"];
	readonly to: AdapterMigrationOptions["to"];
	readonly root?: string;
	readonly include?: readonly RegExp[];
	readonly exclude?: readonly RegExp[];
	readonly mode?: AdapterCapabilityMode;
	readonly registry?: StyleDialectResolver;
	readonly adapterRegistry?: StyleAdapterRegistry;
	readonly loweringRegistry?: StyleLoweringRegistry;
	readonly readFile?: (file: string) => string | undefined;
	readonly listFiles?: (root: string) => readonly string[];
	readonly onResidual?: (event: VirtualMigrationResidual) => void;
}

interface CachedTransform {
	readonly result: AdapterMigrationResult;
}

const VIRTUAL_PREFIX = "\0pandwind:migration:";

function stripQuery(id: string): string {
	const query = id.indexOf("?");
	return query < 0 ? id : id.slice(0, query);
}

function matchesAny(patterns: readonly RegExp[], value: string): boolean {
	return patterns.some((pattern) => {
		pattern.lastIndex = 0;
		return pattern.test(value);
	});
}

function isEligible(
	id: string,
	include: readonly RegExp[] | undefined,
	exclude: readonly RegExp[] | undefined,
): boolean {
	const physical = stripQuery(id);
	return (
		!physical.includes("node_modules") &&
		!physical.startsWith(VIRTUAL_PREFIX) &&
		SOURCE_SCANNER_SERVICE.isScriptFile(physical) &&
		(include === undefined || matchesAny(include, physical)) &&
		(exclude === undefined || !matchesAny(exclude, physical))
	);
}

function readNodeFile(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
}

function generatedAbsolutePath(root: string, file: AdapterGeneratedFile): string {
	return resolve(root, file.path);
}

/**
 * Bundler-neutral virtual migration mechanics. The unplugin factory below
 * projects this one use case into each host bundler; source matching,
 * configuration, lowering, emission, and residual semantics stay in the
 * adapter pipeline.
 */
function createVirtualMigrationPlugin(options: PandwindMigrateOptions) {
	let root = resolve(options.root ?? process.cwd());
	const cache = new Map<string, CachedTransform>();
	const generatedByPath = new Map<string, { readonly id: string; readonly content: string }>();
	const generatedById = new Map<string, string>();
	const readFile = options.readFile ?? readNodeFile;
	const sourceWorkspace = createSourceWorkspace();
	let listedFiles: readonly string[] | undefined;
	const listFiles =
		options.listFiles ??
		((projectRoot: string) => {
			listedFiles ??= sourceWorkspace.files(["**/*"], projectRoot, { includeUnsupported: true });
			return listedFiles;
		});

	const reset = (nextRoot: string): void => {
		root = resolve(nextRoot);
		listedFiles = undefined;
		cache.clear();
		generatedByPath.clear();
		generatedById.clear();
	};

	const emitGeneratedFiles = (files: readonly AdapterGeneratedFile[], sourceFile: string): void => {
		for (const file of files) {
			const absolute = generatedAbsolutePath(root, file);
			const existing = generatedByPath.get(absolute);
			if (existing !== undefined && existing.content !== file.content)
				throw new Error(
					`pandwind virtual migration generated-file conflict at ${file.path} from ${sourceFile}`,
				);
			const id = `${VIRTUAL_PREFIX}${absolute}`;
			generatedByPath.set(absolute, {
				id,
				content: file.content,
			});
			generatedById.set(id, file.content);
		}
	};

	const migrate = async (code: string, id: string): Promise<AdapterMigrationResult> => {
		const key = `${id}\0${code}`;
		const cached = cache.get(key);
		if (cached !== undefined) return cached.result;
		const result = await STYLE_MIGRATION_USE_CASE.runAsync(code, {
			from: options.from,
			to: options.to,
			file: id,
			root,
			mode: options.mode,
			registry: options.registry,
			adapterRegistry: options.adapterRegistry,
			loweringRegistry: options.loweringRegistry,
			readFile,
			listFiles,
		});
		cache.set(key, { result });
		return result;
	};

	return {
		name: `pandwind:virtual-migration:${options.from}->${options.to}`,
		enforce: "pre" as const,
		async transform(code: string, id: string) {
			if (!isEligible(id, options.include, options.exclude)) return null;
			const file = stripQuery(id);
			const result = await migrate(code, file);
			if (result.residuals.length > 0)
				options.onResidual?.({
					file,
					route: { from: options.from, to: options.to },
					residuals: result.residuals,
				});
			if (result.generatedFiles.length > 0) emitGeneratedFiles(result.generatedFiles, file);
			return result.code === code ? null : { code: result.code, map: null };
		},
		resolveId(source: string, importer?: string) {
			if (importer === undefined) return null;
			if (!source.startsWith(".") && !source.startsWith("/")) return null;
			const importerFile = importer.startsWith(VIRTUAL_PREFIX)
				? importer.slice(VIRTUAL_PREFIX.length)
				: stripQuery(importer);
			const candidate = resolve(dirname(importerFile), source);
			return generatedByPath.get(candidate)?.id ?? null;
		},
		load(id: string) {
			return generatedById.get(id) ?? null;
		},
		watchChange(id: string) {
			const file = stripQuery(id);
			for (const key of cache.keys()) if (key.startsWith(`${file}\0`)) cache.delete(key);
			generatedByPath.clear();
			generatedById.clear();
		},
		vite: {
			configResolved(config: { readonly root: string }) {
				reset(config.root);
			},
		},
	};
}

/**
 * Universal codemod bundler plugin. Use a platform slice such as
 * `pandwindMigrateUnplugin.vite` or the named exports below in a bundler
 * configuration. All slices execute the same migration use case.
 */
export const pandwindMigrateUnplugin = createUnplugin<PandwindMigrateOptions, false>(
	(options: PandwindMigrateOptions) => createVirtualMigrationPlugin(options),
);

export const pandwindMigrateVite = pandwindMigrateUnplugin.vite;
export const pandwindMigrateRollup = pandwindMigrateUnplugin.rollup;
export const pandwindMigrateRolldown = pandwindMigrateUnplugin.rolldown;
export const pandwindMigrateWebpack = pandwindMigrateUnplugin.webpack;
export const pandwindMigrateRspack = pandwindMigrateUnplugin.rspack;
export const pandwindMigrateRsbuild = pandwindMigrateUnplugin.rsbuild;
export const pandwindMigrateEsbuild = pandwindMigrateUnplugin.esbuild;
export const pandwindMigrateFarm = pandwindMigrateUnplugin.farm;
export const pandwindMigrateBun = pandwindMigrateUnplugin.bun;
export const pandwindMigrateUnloader = pandwindMigrateUnplugin.unloader;
