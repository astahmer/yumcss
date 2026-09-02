import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
import type { AdapterGeneratedFile } from "./adapter-contract.ts";
import { runAdapterMigrationAsync } from "./adapter-migration.ts";
import type { AdapterCapabilityMode } from "./capabilities.ts";
import type { StyleLoweringRegistry } from "./lowering.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type { StyleSystemRegistry } from "./style-systems.ts";

export interface VirtualMigrationResidual {
	readonly file: string;
	readonly route: { readonly from: string; readonly to: string };
	readonly residuals: AdapterMigrationResult["residuals"];
}

export interface PandwindMigrateViteOptions {
	readonly from: AdapterMigrationOptions["from"];
	readonly to: AdapterMigrationOptions["to"];
	readonly root?: string;
	readonly include?: readonly RegExp[];
	readonly exclude?: readonly RegExp[];
	readonly mode?: AdapterCapabilityMode;
	readonly registry?: StyleSystemRegistry;
	readonly adapterRegistry?: StyleAdapterRegistry;
	readonly loweringRegistry?: StyleLoweringRegistry;
	readonly readFile?: (file: string) => string | undefined;
	readonly listFiles?: (root: string) => readonly string[];
	readonly onResidual?: (event: VirtualMigrationResidual) => void;
}

export interface VirtualMigrationPluginResult {
	readonly code: string;
	readonly map: null;
}

export interface VirtualMigrationVitePlugin {
	readonly name: string;
	readonly enforce: "pre";
	configResolved?(config: { readonly root: string }): void;
	transform(code: string, id: string): Promise<VirtualMigrationPluginResult | null>;
	resolveId(source: string, importer?: string): string | null;
	load(id: string): string | null;
	watchChange(id: string): void;
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
 * Vite composition root for reversible, in-memory adapter migrations.
 *
 * The plugin owns only bundler mechanics. Source matching, configuration,
 * semantic lowering, target emission, and residuals remain in the existing
 * adapter pipeline. `enforce: "pre"` lets an official target plugin consume
 * the migrated module text afterwards.
 */
export function pandwindMigrateVite(
	options: PandwindMigrateViteOptions,
): VirtualMigrationVitePlugin {
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
		const result = await runAdapterMigrationAsync(code, {
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
		enforce: "pre",
		configResolved(config) {
			root = resolve(config.root);
			listedFiles = undefined;
			cache.clear();
			generatedByPath.clear();
			generatedById.clear();
		},
		async transform(code, id) {
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
		resolveId(source, importer) {
			if (importer === undefined) return null;
			if (!source.startsWith(".") && !source.startsWith("/")) return null;
			const importerFile = importer.startsWith(VIRTUAL_PREFIX)
				? importer.slice(VIRTUAL_PREFIX.length)
				: stripQuery(importer);
			const candidate = resolve(dirname(importerFile), source);
			return generatedByPath.get(candidate)?.id ?? null;
		},
		load(id) {
			return generatedById.get(id) ?? null;
		},
		watchChange(id) {
			const file = stripQuery(id);
			for (const key of cache.keys()) if (key.startsWith(`${file}\0`)) cache.delete(key);
			generatedByPath.clear();
			generatedById.clear();
		},
	};
}
