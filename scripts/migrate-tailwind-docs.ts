/**
 * Tailwind CSS docs -> Pandwind migration corpus.
 *
 * The upstream checkout is deliberately read-only. This runner builds the
 * Pandwind metadata from the pinned Tailwind stylesheet, applies one lane at
 * a time through the shared codemod source transformer, and can materialize a
 * complete migrated app in a caller-owned output directory.
 */
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
	buildPandwindInteropArtifact,
	type PandwindInteropArtifact,
} from "../packages/pandwind/src/tw/interop-artifact.ts";
import { generateUtilityBridge } from "../packages/pandwind/src/tw/bridge.ts";
import { generateDesignSystem } from "../packages/pandwind/src/tw/generate-types.ts";
import { SOURCE_SCANNER_SERVICE } from "../packages/pandwind/src/source-scanner.ts";
import { loadMetaFromSources, type PandwindMeta } from "../packages/codemod/src/meta.ts";
import { mapClassList } from "../packages/codemod/src/map.ts";
import { transformSource, type TransformResult } from "../packages/codemod/src/migrate.ts";
import { ensureImport, relativeModuleImport } from "../packages/codemod/src/shared.ts";

const execFileAsync = promisify(execFile);

export enum TailwindDocsLane {
	Tw = "tw",
	CssClass = "css-class",
	DesignDss = "design-dss",
}

export interface TailwindDocsLaneReport {
	readonly lane: TailwindDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly preservedTokens: number;
	readonly outputBytes: number;
	readonly sourceBytes: number;
	readonly outputByteDelta: number;
	readonly generatedUtilities: number;
	readonly generatedVariants: number;
	readonly generatedBridgeEntries: number;
	readonly sourceStylesheetBytes: number;
	readonly residuals: readonly {
		file: string;
		token: string;
		reason: string;
	}[];
}

export interface TailwindDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

interface LaneAdapter {
	readonly id: TailwindDocsLane;
	transform(source: string, file: string, meta: PandwindMeta): TransformResult;
}

interface GeneratedMetadata {
	readonly meta: PandwindMeta;
	readonly typesDts: string;
	readonly twTs: string;
	readonly interop: PandwindInteropArtifact;
	readonly utilityCount: number;
	readonly variantCount: number;
	readonly bridgeEntries: number;
	readonly stylesheet: string;
}

const repositoryRoot = resolve(import.meta.dirname, "..");

/** The upstream CSS contains a self-referential font alias for the docs site. */
function normalizeReferenceStylesheet(css: string): string {
	return css.replace(
		/--font-ubuntu-mono:\s*var\(--font-ubuntu-mono\);/g,
		"--font-ubuntu-mono: ui-monospace;",
	);
}

async function countFiles(root: string): Promise<string[]> {
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

function bridgeEntryCount(bridge: Record<string, Record<string, string>>): number {
	return Object.values(bridge).reduce((total, values) => total + Object.keys(values).length, 0);
}

async function generatedMetadata(referenceRoot: string): Promise<GeneratedMetadata> {
	const tempRoot = await mkdtemp(join(tmpdir(), "pandwind-tailwind-docs-meta-"));
	try {
		await mkdir(join(tempRoot, "node_modules"), { recursive: true });
		const sourceCssRoot = join(referenceRoot, "src/app");
		for (const name of ["globals.css", "search.css", "typography.css"]) {
			const source = await readFile(join(sourceCssRoot, name), "utf8");
			await writeFile(
				join(tempRoot, name),
				name === "globals.css" ? normalizeReferenceStylesheet(source) : source,
			);
		}
		await symlink(
			join(repositoryRoot, "apps/example/node_modules/tailwindcss"),
			join(tempRoot, "node_modules/tailwindcss"),
			"dir",
		);

		const stylesheet = await readFile(join(tempRoot, "globals.css"), "utf8");
		const generated = await generateDesignSystem(stylesheet, tempRoot);
		const bridge = await generateUtilityBridge(stylesheet, tempRoot);
		const interop = buildPandwindInteropArtifact({
			typesDts: generated.typesDts,
			twTs: generated.twTs,
			bridge,
			artifactDir: "generated",
		});
		await writeFile(join(tempRoot, "pandwind.interop.json"), `${JSON.stringify(interop)}\n`);
		return {
			meta: loadMetaFromSources({ interopPath: join(tempRoot, "pandwind.interop.json") }),
			typesDts: generated.typesDts,
			twTs: generated.twTs,
			interop,
			utilityCount: generated.utilityCount,
			variantCount: generated.variantCount,
			bridgeEntries: bridgeEntryCount(bridge),
			stylesheet,
		};
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

function createLane(id: TailwindDocsLane): LaneAdapter {
	return {
		id,
		transform(source, file, meta) {
			if (id === TailwindDocsLane.Tw) {
				return transformSource(source, meta, {
					mode: "tw",
					file,
					metaDir: "src/pandwind",
				});
			}

			const importPath = relativeModuleImport(file, "src/pandwind", "css");
			const prepared = ensureImport(source, `import { css } from "${importPath}";`);
			const result = transformSource(prepared, meta, {
				mode: "css",
				file,
			});
			if (id === TailwindDocsLane.CssClass) return result;
			return {
				...result,
				code: result.code
					.replace(
						`import { css } from "${importPath}";`,
						`import { dcss } from "${relativeModuleImport(file, "src/pandwind", "dcss")}";`,
					)
					.replace(/\bcss\.class\(/g, "dcss.class("),
			};
		},
	};
}

function laneSupportFiles(
	metadata: GeneratedMetadata,
	lane: TailwindDocsLane,
	mappedTokens: ReadonlySet<string>,
): Record<string, string> {
	const support: Record<string, string> = {
		"src/pandwind/types.d.ts": metadata.typesDts,
		"src/pandwind/tw.ts": metadata.twTs,
		"src/pandwind/pandwind.interop.json": `${JSON.stringify(metadata.interop, null, 2)}\n`,
	};
	if (lane === TailwindDocsLane.Tw) {
		support["src/app/pandwind-tw-classes.ts"] =
			`export const pandwindTailwindClasses = ${JSON.stringify(
				[...mappedTokens].toSorted().join(" "),
			)};\n`;
		support["src/pandwind/cx.ts"] =
			'import { createCx } from "pandwind/cx";\nimport { __pandwindConfig } from "./tw";\n\nexport const cx = createCx(__pandwindConfig);\n';
	} else if (lane === TailwindDocsLane.CssClass) {
		support["src/pandwind/css.ts"] =
			'import { createRuntimeCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\n\nexport const css = createRuntimeCss(pandwindPreset);\n';
	} else {
		support["src/pandwind/dcss.ts"] =
			'import { createRuntimeDesignCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\n\nexport const dcss = createRuntimeDesignCss(pandwindPreset);\n';
	}
	return support;
}

export class TailwindDocsMigration {
	static readonly lanes: readonly TailwindDocsLane[] = [
		TailwindDocsLane.Tw,
		TailwindDocsLane.CssClass,
		TailwindDocsLane.DesignDss,
	];

	static async run(
		lane: TailwindDocsLane,
		options: TailwindDocsMigrationOptions = {},
	): Promise<TailwindDocsLaneReport> {
		const referenceRoot = resolve(
			options.referenceRoot ?? "/Users/astahmer/.references/tailwindcss.com",
		);
		const referenceCommit = (
			await execFileAsync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
		).stdout.trim();
		const metadata = await generatedMetadata(referenceRoot);
		const sourceRoot = join(referenceRoot, "src");
		const files = await countFiles(sourceRoot);
		const adapter = createLane(lane);
		const residuals: Array<TailwindDocsLaneReport["residuals"][number]> = [];
		let sourceFiles = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let preservedTokens = 0;
		let outputBytes = 0;
		let sourceBytes = 0;
		const outputFiles = new Map<string, string>();
		const mappedTokens = new Set<string>();

		for (const absoluteFile of files) {
			const source = await readFile(absoluteFile, "utf8");
			if (!source.includes("className=") && !source.includes("class=")) continue;
			const file = relative(referenceRoot, absoluteFile).replaceAll("\\", "/");
			for (const match of source.matchAll(
				/\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g,
			)) {
				const classString = match[1] ?? match[2] ?? match[3] ?? "";
				for (const token of mapClassList(classString, metadata.meta).mapped.map(
					(item) => item.raw,
				)) {
					mappedTokens.add(token);
				}
			}
			const result = adapter.transform(source, file, metadata.meta);
			if (result.converted === 0 && result.unmappedTokens.length === 0) continue;
			sourceFiles++;
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			preservedTokens += result.unmappedTokens.length;
			residuals.push(...result.unmappedTokens);
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			outputFiles.set(file, result.code);
		}

		if (options.outputRoot !== undefined) {
			const outputRoot = resolve(options.outputRoot);
			await mkdir(outputRoot, { recursive: true });
			for (const name of [
				"package.json",
				"pnpm-lock.yaml",
				"next.config.ts",
				"tsconfig.json",
				"eslint.config.mjs",
			]) {
				await cp(join(referenceRoot, name), join(outputRoot, name));
			}
			const packageFile = join(outputRoot, "package.json");
			const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
				dependencies?: Record<string, string>;
			};
			packageJson.dependencies = {
				...packageJson.dependencies,
				pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
			};
			await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
			const nextConfigFile = join(outputRoot, "next.config.ts");
			const nextConfig = await readFile(nextConfigFile, "utf8");
			if (!nextConfig.includes("transpilePackages")) {
				await writeFile(
					nextConfigFile,
					nextConfig.replace(
						"const nextConfig = {",
						'const nextConfig = {\n  transpilePackages: ["pandwind"],',
					),
				);
			}
			const tsconfigFile = join(outputRoot, "tsconfig.json");
			const tsconfig = JSON.parse(await readFile(tsconfigFile, "utf8")) as {
				compilerOptions?: Record<string, unknown>;
			};
			tsconfig.compilerOptions = {
				...tsconfig.compilerOptions,
				allowImportingTsExtensions: true,
			};
			await writeFile(tsconfigFile, `${JSON.stringify(tsconfig, null, 2)}\n`);
			await cp(join(referenceRoot, "public"), join(outputRoot, "public"), { recursive: true });
			await cp(join(referenceRoot, "src"), join(outputRoot, "src"), { recursive: true });
			if (lane === TailwindDocsLane.Tw) {
				const globalStylesheet = join(outputRoot, "src/app/globals.css");
				const stylesheet = await readFile(globalStylesheet, "utf8");
				if (!stylesheet.includes('@source not "./../pandwind";')) {
					await writeFile(globalStylesheet, `${stylesheet}\n@source not "./../pandwind";\n`);
				}
			}
			for (const [file, code] of outputFiles) {
				const target = join(outputRoot, file);
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, code);
			}
			for (const [file, code] of Object.entries(laneSupportFiles(metadata, lane, mappedTokens))) {
				const target = join(outputRoot, file);
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, code);
			}
		}

		return {
			lane,
			referenceCommit,
			sourceFiles,
			changedFiles,
			convertedCallSites,
			preservedTokens,
			outputBytes,
			sourceBytes,
			outputByteDelta: outputBytes - sourceBytes,
			generatedUtilities: metadata.utilityCount,
			generatedVariants: metadata.variantCount,
			generatedBridgeEntries: metadata.bridgeEntries,
			sourceStylesheetBytes: Buffer.byteLength(metadata.stylesheet),
			residuals,
		};
	}
}

if (process.argv[1]?.endsWith("migrate-tailwind-docs.ts")) {
	const lane = process.argv[2] as TailwindDocsLane | undefined;
	if (lane === undefined || !TailwindDocsMigration.lanes.includes(lane)) {
		throw new Error(
			`usage: tsx scripts/migrate-tailwind-docs.ts ${TailwindDocsMigration.lanes.join("|")} [output-root]`,
		);
	}
	const report = await TailwindDocsMigration.run(lane, {
		outputRoot: process.argv[3],
	});
	console.log(JSON.stringify(report, null, 2));
}
