/**
 * PostHog.com -> Pandwind migration corpus.
 *
 * The PostHog checkout is a read-only Git reference. This runner materializes
 * disposable Gatsby applications from the pinned checkout and applies one
 * static-first Pandwind lane at a time. Tokens that cannot be proven against
 * the generated Pandwind bridge remain in the original class list and become
 * explicit residuals; the runner never silently drops a Tailwind utility.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { loadMetaFromSources, type PandwindMeta } from "../packages/codemod/src/meta.ts";
import { mapClassList } from "../packages/codemod/src/map.ts";
import { transformSource, type TransformResult } from "../packages/codemod/src/migrate.ts";
import { ensureImport, relativeModuleImport } from "../packages/codemod/src/shared.ts";
import { SOURCE_SCANNER_SERVICE } from "../packages/pandwind/src/source-scanner.ts";

const execFileAsync = promisify(execFile);

export enum PostHogDocsLane {
	Tw = "tw",
	CssClass = "css-class",
	DesignCss = "design-css",
}

export interface PostHogDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

export interface PostHogDocsMigrationReport {
	readonly lane: PostHogDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly residualCount: number;
	readonly residuals: readonly { file: string; token: string; reason: string }[];
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly mappedTokens: number;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = "/Users/astahmer/.references/posthog-com";
const metadataRoot = resolve(repositoryRoot, "apps/example/src");

async function sourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (SOURCE_SCANNER_SERVICE.isScriptFile(entry.name)) files.push(absolute);
		}
	};
	await visit(root);
	return files.toSorted();
}

function metadata(): PandwindMeta {
	return loadMetaFromSources({
		typesDtsPath: join(metadataRoot, "types.d.ts"),
		twTsPath: join(metadataRoot, "tw.ts"),
		bridgePath: join(metadataRoot, "bridge.ts"),
		interopPath: join(metadataRoot, "pandwind.interop.json"),
	});
}

function transformLane(
	lane: PostHogDocsLane,
	source: string,
	file: string,
	meta: PandwindMeta,
): TransformResult {
	if (lane === PostHogDocsLane.Tw) {
		return transformSource(source, meta, { mode: "tw", file, metaDir: "src/pandwind" });
	}
	const binding = lane === PostHogDocsLane.CssClass ? "pandwindCss" : "pandwindDcss";
	const module = lane === PostHogDocsLane.CssClass ? "css" : "dcss";
	const prepared = ensureImport(
		source,
		`import { ${module} as ${binding} } from "${relativeModuleImport(file, "src/pandwind", module)}";`,
	);
	return transformSource(prepared, meta, { mode: "css", file, cssBinding: binding });
}

function supportFiles(lane: PostHogDocsLane): Record<string, string> {
	const twSource = readFileSyncSafe(join(metadataRoot, "tw.ts"));
	const typesSource = readFileSyncSafe(join(metadataRoot, "types.d.ts"));
	const bridgeSource = readFileSyncSafe(join(metadataRoot, "bridge.ts"));
	const cxSource =
		'import { createCx } from "pandwind/cx";\nimport { __pandwindConfig } from "./tw";\n\nexport const cx = createCx(__pandwindConfig);\n';
	const base: Record<string, string> = {
		"src/pandwind/tw.ts": twSource,
		"src/pandwind/types.d.ts": typesSource,
		"src/pandwind/bridge.ts": bridgeSource,
	};
	base["src/pandwind/cx.ts"] = cxSource;
	if (lane === PostHogDocsLane.CssClass) {
		base["src/pandwind/css.ts"] =
			'import { createCss } from "pandwind/css";\nimport { examplePreset } from "pandwind/preset/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const css = createCss(examplePreset, { className: twAdapter });\n';
	}
	if (lane === PostHogDocsLane.DesignCss) {
		base["src/pandwind/dcss.ts"] =
			'import { createDesignCss } from "pandwind/design";\nimport type { CssFn } from "pandwind/css";\nimport { examplePreset } from "pandwind/preset/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const dcss = createDesignCss(examplePreset, { className: twAdapter }) as unknown as CssFn;\n';
	}
	return base;
}

function readFileSyncSafe(path: string): string {
	// This runner only reads checked-in generated artifacts from the Pandwind
	// repository; keeping the helper local avoids exposing a second file API.
	return readFileSync(path, "utf8");
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: PostHogDocsLane,
	changed: ReadonlyMap<string, string>,
	mappedTokens: ReadonlySet<string>,
): Promise<void> {
	await rm(outputRoot, { recursive: true, force: true });
	await cp(referenceRoot, outputRoot, {
		recursive: true,
		filter: (source) =>
			!source.includes("/.git/") &&
			!source.includes("/node_modules/") &&
			!source.includes("/.cache/"),
	});

	for (const [file, code] of changed) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	for (const [file, code] of Object.entries(supportFiles(lane))) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}

	const packageFile = join(outputRoot, "package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 4)}\n`);

	const safelist = join(outputRoot, "safelist.txt");
	const existingSafelist = await readFile(safelist, "utf8");
	const additions = [...mappedTokens]
		.toSorted()
		.filter((token) => !existingSafelist.includes(token));
	await writeFile(safelist, `${existingSafelist.trimEnd()}\n${additions.join("\n")}\n`);
}

export class PostHogDocsMigration {
	static readonly lanes: readonly PostHogDocsLane[] = [
		PostHogDocsLane.Tw,
		PostHogDocsLane.CssClass,
		PostHogDocsLane.DesignCss,
	];

	static async run(
		lane: PostHogDocsLane,
		options: PostHogDocsMigrationOptions = {},
	): Promise<PostHogDocsMigrationReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = (
			await execFileAsync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
		).stdout.trim();
		const meta = metadata();
		const root = join(referenceRoot, "src");
		const files = await sourceFiles(root);
		const outputRoot = resolve(options.outputRoot ?? join(referenceRoot, ".pandwind-output"));
		const changed = new Map<string, string>();
		const residuals: Array<PostHogDocsMigrationReport["residuals"][number]> = [];
		const mappedTokens = new Set<string>();
		let sourceFilesCount = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let sourceBytes = 0;
		let outputBytes = 0;

		for (const absolute of files) {
			const source = await readFile(absolute, "utf8");
			if (!source.includes("className=")) continue;
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			const result = transformLane(lane, source, file, meta);
			if (!result.changed && result.unmappedTokens.length === 0) continue;
			sourceFilesCount++;
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			residuals.push(...result.unmappedTokens);
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			changed.set(file, result.code);

			for (const match of source.matchAll(
				/\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g,
			)) {
				const classString = match[1] ?? match[2] ?? match[3] ?? "";
				for (const token of mapClassList(classString, meta).mapped) mappedTokens.add(token.raw);
			}
		}

		if (options.outputRoot !== undefined) {
			await materialize(referenceRoot, outputRoot, lane, changed, mappedTokens);
		}

		return {
			lane,
			referenceCommit,
			sourceFiles: sourceFilesCount,
			changedFiles,
			convertedCallSites,
			residualCount: residuals.length,
			residuals,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			mappedTokens: mappedTokens.size,
		};
	}
}

if (process.argv[1]?.endsWith("migrate-posthog-docs.ts")) {
	const lane = process.argv[2] as PostHogDocsLane | undefined;
	if (lane === undefined || !PostHogDocsMigration.lanes.includes(lane)) {
		throw new Error(
			`usage: tsx scripts/migrate-posthog-docs.ts ${PostHogDocsMigration.lanes.join("|")} [output-root]`,
		);
	}
	console.log(
		JSON.stringify(await PostHogDocsMigration.run(lane, { outputRoot: process.argv[3] }), null, 2),
	);
}
