import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../packages/codemod/src/swap/index.ts";

/** Public migration lanes for the pinned Astryx docsite corpus. */
export enum AstryxDocsLane {
	RuntimeCss = "runtime-css",
	StaticCss = "static-css",
	DesignDss = "design-dss",
}

export interface AstryxDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
	readonly pandwindRoot?: string;
}

export interface AstryxDocsLaneReport {
	readonly schema: "pandwind.astryx-docs-migration/1";
	readonly lane: AstryxDocsLane;
	readonly referenceCommit: string;
	readonly sourceRoot: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly skippedCallSites: number;
	readonly residuals: number;
	readonly runtimeFallbackFiles: number;
	readonly runtimeFallbackFileNames: readonly string[];
	readonly staticExtractionRatio: number;
	readonly staticCssCoverageRatio: number;
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly residualDetails: readonly {
		readonly file: string;
		readonly kind: string;
		readonly hint?: string;
	}[];
}

interface AstryxLaneAdapter {
	readonly lane: AstryxDocsLane;
	transform(source: string, context: { file: string; root: string }): AdapterMigrationResult;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = "/Users/astahmer/.references/astryx/apps/docsite";
const stylexAdapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.StyleX);

function matchingBrace(source: string, open: number): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") depth++;
		if (character === "}" && --depth === 0) return index;
	}
	return undefined;
}

/** Project Astryx's custom xstyle host prop onto the neutral JSX style host. */
function normalizeXstyleHosts(source: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(/\bxstyle\s*=\s*\{/g)) {
		const start = match.index ?? 0;
		const open = start + match[0].lastIndexOf("{");
		const close = matchingBrace(source, open);
		if (close === undefined) continue;
		edits.push({
			start,
			end: close + 1,
			text: `{...stylex.props(${source.slice(open + 1, close)})}`,
		});
	}
	return edits
		.toSorted((left, right) => right.start - left.start)
		.reduce((output, edit) => output.slice(0, edit.start) + edit.text + output.slice(edit.end), source);
}

function matchingParen(source: string, open: number): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth++;
		if (character === ")" && --depth === 0) return index;
	}
	return undefined;
}

function topLevelColon(entry: string): number {
	let depth = 0;
	let quote: string | undefined;
	for (let index = 0; index < entry.length; index++) {
		const character = entry[index]!;
		if (quote !== undefined) {
			if (character === quote && entry[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if ("([{".includes(character)) depth++;
		else if (")]".includes(character)) depth--;
		else if (character === ":" && depth === 0) return index;
	}
	return -1;
}

function topLevelEntries(object: string): string[] {
	const entries: string[] = [];
	let start = 1;
	let depth = 0;
	let quote: string | undefined;
	for (let index = 1; index < object.length - 1; index++) {
		const character = object[index]!;
		if (quote !== undefined) {
			if (character === quote && object[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if ("([{".includes(character)) depth++;
		else if (")]".includes(character)) depth--;
		else if (character === "," && depth === 0) {
			if (object.slice(start, index).trim() !== "") entries.push(object.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = object.slice(start, -1).trim();
	if (last !== "") entries.push(last);
	return entries;
}

function wrapDesignRawObjects(source: string): string {
	let output = source;
	for (const call of ["css.group", "css.class"]) {
		for (const match of [...output.matchAll(new RegExp(`\\b${call.replace(".", "\\.")}\\s*\\(`, "g"))].toReversed()) {
			const start = match.index ?? 0;
			const open = start + match[0].lastIndexOf("(");
			const close = matchingParen(output, open);
			if (close === undefined) continue;
			const argument = output.slice(open + 1, close).trim();
			if (!argument.startsWith("{") || !argument.endsWith("}")) continue;
			const entries = topLevelEntries(argument).map((entry) => {
				const colon = topLevelColon(entry);
				if (colon < 0) return entry;
				const key = entry.slice(0, colon).trim();
				const value = entry.slice(colon + 1).trim();
				if (value.startsWith("{ $raw:")) return entry;
				if (/^(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(value)) return entry;
				return `${key}: { $raw: ${value} }`;
			});
			output = output.slice(0, open + 1) + `{ ${entries.join(", ")} }` + output.slice(close);
		}
	}
	return output;
}

function useDesignApi(source: string): string {
	let output = wrapDesignRawObjects(source);
	output = output.replace(
		/import \{ createCss \} from "pandwind\/css";/g,
		'import { createDesignCss } from "pandwind/design";\nimport { pandwindPreset } from "pandwind/preset";',
	);
	output = output.replace(/const css = createCss\(\);/g, "const css = createDesignCss(pandwindPreset);");
	return output;
}

function createLaneAdapter(lane: AstryxDocsLane): AstryxLaneAdapter {
	return {
		lane,
		transform(source, context) {
			const normalized = normalizeXstyleHosts(source);
			const result = runAdapterMigration(normalized, {
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: context.file,
				root: context.root,
				mode: "safe",
				semantic: { source: { file: context.file, framework: "react" } },
			});
			if (lane !== AstryxDocsLane.DesignDss) return result;
			return { ...result, code: useDesignApi(result.code) };
		},
	};
}

async function collectSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else if (/\.(?:[cm]?[jt]sx?|mdx?)$/.test(entry.name)) files.push(file);
		}
	};
	await visit(join(root, "src"));
	return files.toSorted();
}

function installStaticExtractorConfig(outputRoot: string, pandwindRoot: string): Promise<void> {
	return Promise.all([
		(async () => {
			const configFile = join(outputRoot, "next.config.mjs");
			let config = await readFile(configFile, "utf8");
			if (!config.includes("pandwindWebpackCss")) {
				config = `import { pandwindWebpackCss } from ${JSON.stringify(join(pandwindRoot, "packages/pandwind/src/unplugin.ts"))};\nimport { pandwindPreset } from ${JSON.stringify(join(pandwindRoot, "packages/pandwind/src/preset/preset.ts"))};\nconst pandwindCssPlugin = pandwindWebpackCss({ preset: pandwindPreset, root: import.meta.dirname, cssSources: [/pandwind\\/(?:css|design)/] });\n${config}`;
				config = config.replace(
					"    return config;",
					"    config.plugins.push(pandwindCssPlugin);\n    return config;",
				);
			}
			await writeFile(configFile, config);
		})(),
		(async () => {
			const layoutFile = join(outputRoot, "src/app/layout.tsx");
			let layout = await readFile(layoutFile, "utf8");
			if (!layout.includes('"pandwind:css"')) {
				layout = layout.replace("import './globals.css';", "import './globals.css';\nimport 'pandwind:css';");
				layout = layout.replace('import "./globals.css";', 'import "./globals.css";\nimport "pandwind:css";');
			}
			await writeFile(layoutFile, layout);
		})(),
	]);
}

export class AstryxDocsMigration {
	static readonly lanes = [
		createLaneAdapter(AstryxDocsLane.RuntimeCss),
		createLaneAdapter(AstryxDocsLane.StaticCss),
		createLaneAdapter(AstryxDocsLane.DesignDss),
	] as const;

	static async run(
		lane: AstryxDocsLane,
		options: AstryxDocsMigrationOptions = {},
	): Promise<AstryxDocsLaneReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const outputRoot = options.outputRoot === undefined ? undefined : resolve(options.outputRoot);
		const pandwindRoot = resolve(options.pandwindRoot ?? repositoryRoot);
		const adapter = this.lanes.find((candidate) => candidate.lane === lane);
		if (adapter === undefined) throw new Error(`Unknown Astryx docs lane: ${lane}`);
		const files = await collectSourceFiles(referenceRoot);
		const referenceCommit = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		if (outputRoot !== undefined) {
			await mkdir(dirname(outputRoot), { recursive: true });
			await cp(referenceRoot, outputRoot, {
				recursive: true,
				filter: (source) => !source.includes("/.next") && !source.includes("/node_modules"),
			});
		}
		let changedFiles = 0;
		let convertedCallSites = 0;
		let skippedCallSites = 0;
		let residuals = 0;
		let sourceBytes = 0;
		let outputBytes = 0;
		let runtimeFallbackFiles = 0;
		const runtimeFallbackFileNames: string[] = [];
		let staticCallSites = 0;
		let staticCssCallSites = 0;
		const residualDetails: AstryxDocsLaneReport["residualDetails"] = [];
		for (const absoluteFile of files) {
			const source = await readFile(absoluteFile, "utf8");
			const file = relative(referenceRoot, absoluteFile);
			if (stylexAdapter?.detect({ file, source, root: referenceRoot }).matched !== true) continue;
			sourceBytes += Buffer.byteLength(source);
			const result = adapter.transform(source, { file, root: referenceRoot });
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			skippedCallSites += result.skipped;
			residuals += result.residuals.length;
			staticCallSites += result.converted;
			staticCssCallSites += result.code.includes("createRuntimeCss") ? 0 : result.converted;
			if (result.code.includes("createRuntimeCss")) {
				runtimeFallbackFiles++;
				runtimeFallbackFileNames.push(file);
			}
			for (const residual of result.residuals)
				residualDetails.push({ file, kind: residual.kind, hint: residual.hint });
			outputBytes += Buffer.byteLength(result.code);
			if (outputRoot !== undefined) {
				const outputFile = join(outputRoot, file);
				await mkdir(dirname(outputFile), { recursive: true });
				await writeFile(outputFile, result.code);
			}
		}
		if (outputRoot !== undefined) await installStaticExtractorConfig(outputRoot, pandwindRoot);
		const report: AstryxDocsLaneReport = {
			schema: "pandwind.astryx-docs-migration/1",
			lane,
			referenceCommit,
			sourceRoot: referenceRoot,
			sourceFiles: files.length,
			changedFiles,
			convertedCallSites,
			skippedCallSites,
			residuals,
			runtimeFallbackFiles,
			runtimeFallbackFileNames,
			staticExtractionRatio: staticCallSites === 0 ? 1 : staticCallSites / convertedCallSites,
			staticCssCoverageRatio: convertedCallSites === 0 ? 1 : staticCssCallSites / convertedCallSites,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			residualDetails,
		};
		if (outputRoot !== undefined)
			await writeFile(join(outputRoot, `pandwind-${lane}.json`), `${JSON.stringify(report, null, 2)}\n`);
		return report;
	}
}

if (import.meta.main) {
	const lane = process.argv[2] as AstryxDocsLane | undefined;
	if (lane === undefined)
		throw new Error("Usage: tsx scripts/migrate-astryx-docs.ts <runtime-css|static-css|design-dss> [reference-root] [output-root]");
	const report = await AstryxDocsMigration.run(lane, {
		referenceRoot: process.argv[3],
		outputRoot: process.argv[4],
	});
	console.log(JSON.stringify(report, null, 2));
}
