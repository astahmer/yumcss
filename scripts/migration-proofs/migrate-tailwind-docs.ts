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
	generateDesignSystem,
	generateUtilityBridge,
	type PandwindInteropArtifact,
} from "pandwind-codemod/tw";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { loadMetaFromSources, type PandwindMeta } from "pandwind-codemod/migration/meta";
import { mapClassList } from "pandwind-codemod/migration/map";
import { CodemodAdapterId, SwapSourceId } from "pandwind-codemod/swap";
import { createReferenceWorkspace } from "../reference-workspace.ts";
import {
	migrateRegisteredFile,
	type CorpusTransformResult,
} from "../registered-adapter-migration.ts";

const execFileAsync = promisify(execFile);
const referenceWorkspace = createReferenceWorkspace();

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
	transform(
		source: string,
		file: string,
		meta: PandwindMeta,
		root: string,
		files: readonly string[],
	): Promise<CorpusTransformResult>;
}

/**
 * Headless UI owns the ref/Fragment contract for transition children. A
 * utility-only rewrite cannot safely alter that host composition: on the
 * pinned docs checkout, changing classes inside an anchored MenuItems
 * transition triggers a production hydration error even though its emitted
 * CSS is byte-identical. Preserve that host subtree as a lossless residual
 * until a dedicated Headless UI host adapter can rewrite the composition.
 */
const tailwindDocsHostAdapter = {
	preservedSource(source: string, file: string): boolean {
		return (
			file.endsWith(".tsx") &&
			source.includes('from "@headlessui/react"') &&
			/<Transition[\s\S]*<MenuItems[\s\S]*\banchor=/.test(source)
		);
	},
};

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

const repositoryRoot = resolve(import.meta.dirname, "../..");

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
			join(repositoryRoot, "examples/example/node_modules/tailwindcss"),
			join(tempRoot, "node_modules/tailwindcss"),
			"dir",
		);

		const stylesheet = await readFile(join(tempRoot, "globals.css"), "utf8");
		const generated = await generateDesignSystem(stylesheet, tempRoot);
		const bridge = await generateUtilityBridge(stylesheet, tempRoot);
		const interop = buildPandwindInteropArtifact({
			typesDts: generated.typesDts,
			twTs: generated.twTs,
			twRuntimeTs: generated.twRuntimeTs,
			twBuildTs: generated.twBuildTs,
			bridge,
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
		async transform(source, file, meta, root, files) {
			if (id === TailwindDocsLane.Tw && tailwindDocsHostAdapter.preservedSource(source, file)) {
				return {
					code: source,
					changed: false,
					converted: 0,
					unmappedTokens: [
						{
							file,
							token: "<Transition><MenuItems anchor> host composition",
							reason: "preserved because Headless UI owns the production ref/Fragment contract",
						},
					],
					skippedByMarker: 0,
				};
			}
			const dialect =
				id === TailwindDocsLane.Tw
					? SwapSourceId.Tw
					: id === TailwindDocsLane.CssClass
						? SwapSourceId.Css
						: SwapSourceId.Dss;
			return migrateRegisteredFile({
				source,
				file,
				root,
				files,
				meta,
				from: CodemodAdapterId.Tailwind,
				to: `${CodemodAdapterId.Pandwind}:${dialect}`,
				project:
					id === TailwindDocsLane.Tw
						? { twModule: "src/pandwind/tw", cxModule: "src/pandwind/cx" }
						: id === TailwindDocsLane.CssClass
							? { cssModule: "src/pandwind/css" }
							: { dssModule: "src/pandwind/dss" },
			});
		},
	};
}

function runtimeStyleSheetSource(binding: "css" | "dss"): string {
	return `"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ${binding} } from "./${binding}";

export function PandwindStyleSheet() {
	const emitted = useRef<string | undefined>(undefined);
	useServerInsertedHTML(() => {
		const value = ${binding}.sheet.css();
		if (value === emitted.current) return null;
		emitted.current = value;
		return <style data-pandwind dangerouslySetInnerHTML={{ __html: value }} />;
	});
	return null;
}
`;
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
			'import type { CssFn } from "pandwind/css";\nimport { createRuntimeCss } from "pandwind/css/runtime";\nimport { defaultPreset } from "pandwind/preset/default";\n\nexport const css = createRuntimeCss(defaultPreset) as unknown as CssFn & { sheet: { css(): string } };\n';
		support["src/pandwind/style-sheet.tsx"] = runtimeStyleSheetSource("css");
	} else {
		support["src/pandwind/dss.ts"] =
			'import type { CssFn } from "pandwind/css";\nimport { createRuntimeDesignCss } from "pandwind/css/runtime";\nimport { defaultPreset } from "pandwind/preset/default";\n\nexport const dss = createRuntimeDesignCss(defaultPreset) as unknown as CssFn & { sheet: { css(): string } };\n';
		support["src/pandwind/style-sheet.tsx"] = runtimeStyleSheetSource("dss");
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
			options.referenceRoot ?? referenceWorkspace.path("tailwindcss.com"),
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
			const result = await adapter.transform(source, file, metadata.meta, referenceRoot, files);
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
			const globalStylesheet = join(outputRoot, "src/app/globals.css");
			const stylesheet = await readFile(globalStylesheet, "utf8");
			if (!stylesheet.includes('@source not "./../pandwind";')) {
				await writeFile(globalStylesheet, `${stylesheet}\n@source not "./../pandwind";\n`);
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
			if (lane !== TailwindDocsLane.Tw) {
				const layoutFile = join(outputRoot, "src/app/layout.tsx");
				const layout = await readFile(layoutFile, "utf8");
				const withStyleSheetImport = layout.includes("PandwindStyleSheet")
					? layout
					: `import { PandwindStyleSheet } from "../pandwind/style-sheet";\n${layout}`;
				await writeFile(
					layoutFile,
					withStyleSheetImport.replace(
						'        <GoogleAnalytics gaId="G-TMR96VNVMT" />',
						`        <PandwindStyleSheet />\n        <GoogleAnalytics gaId="G-TMR96VNVMT" />`,
					),
				);
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
