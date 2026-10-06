import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
	createYumCSSAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	runAdapterMigrationAsync,
	NODE_PROJECT_MODULE_LOADER,
	type AdapterMigrationResult,
	type AdapterProjectBindings,
} from "@yumcss/codemod/swap";
import type { YumCSSMeta } from "@yumcss/codemod/migration/meta";

export interface CorpusTransformResult {
	readonly code: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly unmappedTokens: readonly { file: string; token: string; reason: string }[];
	readonly skippedByMarker: number;
}

export interface RegisteredMigrationOptions {
	readonly source: string;
	/** Root-relative document identifier used by the adapter and emitted imports. */
	readonly file: string;
	readonly root: string;
	readonly files: readonly string[];
	readonly meta: YumCSSMeta;
	readonly from: string;
	readonly to: string;
	readonly project?: AdapterProjectBindings;
}

const adapterRegistry = createStyleAdapterRegistry([
	createTailwindAdapter({ moduleLoader: NODE_PROJECT_MODULE_LOADER }),
	createYumCSSAdapter({ moduleLoader: null }),
]);

function readProjectFile(root: string, file: string): string | undefined {
	try {
		return readFileSync(file.startsWith("/") ? file : resolve(root, file), "utf8");
	} catch {
		return undefined;
	}
}

function toCorpusResult(result: AdapterMigrationResult, file: string): CorpusTransformResult {
	return {
		code: result.code,
		changed: result.changed,
		converted: result.converted,
		unmappedTokens: result.residuals.map((residual) => ({
			file,
			token: residual.text,
			reason: residual.hint ?? residual.kind,
		})),
		skippedByMarker: result.skipped,
	};
}

export async function migrateRegisteredFile(
	options: RegisteredMigrationOptions,
): Promise<CorpusTransformResult> {
	const result = await runAdapterMigrationAsync(options.source, {
		from: options.from,
		to: options.to,
		file: options.file,
		root: options.root,
		meta: options.meta,
		mode: "safe",
		readFile: (file) => readProjectFile(options.root, file),
		listFiles: () => options.files,
		...(options.project === undefined ? {} : { project: options.project }),
		adapterRegistry,
	});
	return toCorpusResult(result, options.file);
}

export async function discoverProjectFiles(root: string): Promise<readonly string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (
				entry.name === ".git" ||
				entry.name === "node_modules" ||
				entry.name === ".next" ||
				entry.name === ".cache" ||
				entry.name === "dist"
			)
				continue;
			const file = resolve(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else if (entry.isFile()) files.push(file);
		}
	};
	await visit(resolve(root));
	return files.toSorted();
}
