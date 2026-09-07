import { readFileSync, readdir } from "node:fs";
import { resolve } from "node:path";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigrationAsync,
	SwapSourceId,
	type AdapterMigrationResult,
	type AdapterProjectBindings,
} from "pandwind-codemod/swap";
import type { PandwindMeta } from "pandwind-codemod/migration/meta";

export interface CorpusTransformResult {
	readonly code: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly unmappedTokens: readonly { file: string; token: string; reason: string }[];
	readonly skippedByMarker: number;
}

export interface TailwindCorpusMigrationOptions {
	readonly source: string;
	/** Root-relative document identifier used by the adapter and emitted imports. */
	readonly file: string;
	readonly root: string;
	readonly files: readonly string[];
	readonly meta: PandwindMeta;
	readonly dialect: SwapSourceId;
	readonly project?: AdapterProjectBindings;
}

const catalog = createBuiltinCodemodCatalog();

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

export async function migrateTailwindCorpusFile(
	options: TailwindCorpusMigrationOptions,
): Promise<CorpusTransformResult> {
	const result = await runAdapterMigrationAsync(options.source, {
		from: CodemodAdapterId.Tailwind,
		to: `${CodemodAdapterId.Pandwind}:${options.dialect}`,
		file: options.file,
		root: options.root,
		meta: options.meta,
		mode: "safe",
		readFile: (file) => readProjectFile(options.root, file),
		listFiles: () => options.files,
		...(options.project === undefined ? {} : { project: options.project }),
		adapterRegistry: catalog.registry,
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
