/**
 * Effect website -> Pandwind migration corpus.
 *
 * The upstream checkout is a pinned, read-only reference. This runner creates
 * disposable worktrees for each migration lane, preserves the original static
 * utility vocabulary for Tailwind's compiler, and records every token that the
 * bridge cannot prove. A residual is safer than silently changing a website.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { loadMetaFromSources, type PandwindMeta } from "pandwind-codemod/migration/meta";
import { mapClassList } from "pandwind-codemod/migration/map";
import { relativeModuleImport } from "pandwind-codemod/migration/shared";
import { CodemodAdapterId, SwapSourceId } from "pandwind-codemod/swap";
import { tokenizeClassList } from "pandwind-codemod/migration/tokens";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import {
	migrateRegisteredFile,
	type CorpusTransformResult,
} from "./registered-adapter-migration.ts";

const execFileAsync = promisify(execFile);

export enum EffectDocsLane {
	Tw = "tw",
	Css = "css",
	DesignCss = "design-css",
}

export interface EffectDocsMigrationReport {
	readonly lane: EffectDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly residualCount: number;
	readonly residuals: readonly { file: string; token: string; reason: string }[];
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = createReferenceWorkspace().path("effect-ts-website");
const expectedReferenceCommit = "366419b44eb2bd353cbe3d3e41fa4e8c735e63ee";
const metadataRoot = resolve(repositoryRoot, "apps/example/src");

async function sourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (SOURCE_SCANNER_SERVICE.isSupportedFile(entry.name)) files.push(absolute);
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

function readCheckedIn(path: string): string {
	return readFileSync(path, "utf8");
}

function isAstroTemplatePosition(source: string, index: number): boolean {
	const frontmatterStart = source.startsWith("---") ? 0 : -1;
	if (frontmatterStart === 0) {
		const frontmatterEnd = source.indexOf("\n---", 3);
		if (frontmatterEnd !== -1 && index < frontmatterEnd + 4) return false;
	}
	for (const [open, close] of [
		["<script", "</script>"],
		["<style", "</style>"],
	] as const) {
		const opened = source.lastIndexOf(open, index);
		const closed = source.lastIndexOf(close, index);
		if (opened > closed) return false;
	}
	return true;
}

interface AstroClassMatch {
	readonly full: string;
	readonly classString: string;
	readonly start: number;
}

function astroClassMatches(source: string): AstroClassMatch[] {
	const matches: AstroClassMatch[] = [];
	const regex = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g;
	for (const match of source.matchAll(regex)) {
		const start = match.index ?? 0;
		if (!isAstroTemplatePosition(source, start)) continue;
		const tagEnd = source.indexOf(">", start);
		const openingTag = tagEnd === -1 ? "" : source.slice(start, tagEnd);
		// Astro normally merges `class` and `class:list` into one attribute.
		// Replacing only the static half would produce duplicate HTML class
		// attributes, so directive-aware sites remain untouched for now.
		if (/\bclass:list\s*=|\bclass:[\w-]+\s*=/.test(openingTag)) continue;
		matches.push({
			full: match[0],
			classString: match[1] ?? match[2] ?? match[3] ?? "",
			start,
		});
	}
	return matches;
}

interface ObjectNode {
	entries: Array<{ key: string; value: string | true | ObjectNode | Array<string | true> }>;
}

const isObjectNode = (value: ObjectNode["entries"][number]["value"]): value is ObjectNode =>
	typeof value === "object" && !Array.isArray(value);

function insertMapped(
	root: ObjectNode,
	mapped: { variants: readonly string[]; key: string; value: string | true },
): void {
	let node = root;
	for (const variant of mapped.variants) {
		const existing = node.entries.find(
			(entry) => entry.key === variant && isObjectNode(entry.value),
		);
		if (existing !== undefined) node = existing.value as ObjectNode;
		else {
			const created: ObjectNode = { entries: [] };
			node.entries.push({ key: variant, value: created });
			node = created;
		}
	}
	const existingLeaf = node.entries.find(
		(entry) => entry.key === mapped.key && !isObjectNode(entry.value),
	);
	if (existingLeaf !== undefined) {
		existingLeaf.value = Array.isArray(existingLeaf.value)
			? [...existingLeaf.value, mapped.value]
			: [existingLeaf.value as string | true, mapped.value];
		return;
	}
	node.entries.push({ key: mapped.key, value: mapped.value });
}

function serializeObject(node: ObjectNode, indent: string): string {
	if (node.entries.length === 0) return "{}";
	const inner = node.entries
		.map((entry) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(entry.key) ? entry.key : JSON.stringify(entry.key);
			const value = isObjectNode(entry.value)
				? serializeObject(entry.value, `${indent}\t`)
				: Array.isArray(entry.value)
					? `[${entry.value.map((itemValue) => (itemValue === true ? "true" : JSON.stringify(itemValue))).join(", ")}]`
					: entry.value === true
						? "true"
						: JSON.stringify(entry.value);
			return `${indent}\t${key}: ${value},`;
		})
		.join("\n");
	return `{\n${inner}\n${indent}}`;
}

const camelProperty = (property: string): string =>
	property.replace(/-(\w|$)/g, (_match, character: string) => character.toUpperCase());

function serializeDeclarations(
	classString: string,
	meta: PandwindMeta,
): { body: string; residual: string; mapped: number } {
	const declarations: Array<[string, string]> = [];
	const residual: string[] = [];
	for (const token of tokenizeClassList(classString)) {
		const resolved = meta.bridgeInverse.get(token);
		if (resolved === undefined) residual.push(token);
		else declarations.push([camelProperty(resolved.property), resolved.value]);
	}
	const body = declarations
		.map(([property, value]) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(property) ? property : JSON.stringify(property);
			return `\t\t${key}: ${JSON.stringify(value)},`;
		})
		.join("\n");
	return { body, residual: residual.join(" "), mapped: declarations.length };
}

function astroLocalStyleClassTokens(source: string): ReadonlySet<string> {
	const tokens = new Set<string>();
	for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
		for (const selector of match[1].matchAll(/(?:^|[^\w-])\.([A-Za-z_][\w-]*)/g))
			tokens.add(selector[1]);
	}
	return tokens;
}

function applyAstroLane(
	source: string,
	file: string,
	importFile: string,
	lane: EffectDocsLane,
	meta: PandwindMeta,
): CorpusTransformResult {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const unmappedTokens: CorpusTransformResult["unmappedTokens"] = [];
	let converted = 0;
	let needsCx = false;
	const localStyleTokens = astroLocalStyleClassTokens(source);
	for (const match of astroClassMatches(source)) {
		const outcome = mapClassList(match.classString, meta);
		const declarations = serializeDeclarations(match.classString, meta);
		const isTw = lane === EffectDocsLane.Tw;
		const bridgeResiduals = isTw
			? outcome.unmapped
			: tokenizeClassList(declarations.residual).map((raw) => ({
					raw,
					reason: "not in generated bridge",
				}));
		const localResiduals = tokenizeClassList(match.classString).filter((token) =>
			localStyleTokens.has(token),
		);
		const residualTokens = [
			...new Set([...bridgeResiduals.map((token) => token.raw), ...localResiduals]),
		];
		for (const token of residualTokens) {
			const bridgeResidual = bridgeResiduals.find((candidate) => candidate.raw === token);
			unmappedTokens.push({
				file,
				token,
				reason: bridgeResidual?.reason ?? "referenced by local Astro style",
			});
		}
		if (isTw && outcome.mapped.length === 0) continue;
		if (!isTw && declarations.mapped === 0) continue;
		const root: ObjectNode = { entries: [] };
		if (isTw) for (const mapped of outcome.mapped) insertMapped(root, mapped);
		const api = isTw ? "tw" : lane === EffectDocsLane.Css ? "css" : "dss";
		const residual = residualTokens.join(" ");
		const styles = isTw
			? serializeObject(root, "\t")
			: lane === EffectDocsLane.DesignCss
				? `{ $raw: {\n${declarations.body}\n\t} }`
				: `{\n${declarations.body}\n\t}`;
		const replacement = residual
			? `class={ cx(${isTw ? `tw(${styles})` : `${api}.class(${styles})`}, ${JSON.stringify(residual)}) }`
			: isTw
				? `class={ tw(${styles}) }`
				: `class={ ${api}.class(${styles}) }`;
		needsCx ||= residual.length > 0;
		converted++;
		edits.push({ start: match.start, end: match.start + match.full.length, text: replacement });
	}
	if (edits.length === 0)
		return { code: source, changed: false, converted: 0, unmappedTokens, skippedByMarker: 0 };
	let code = applyEdits(source, edits);
	const api = lane === EffectDocsLane.Tw ? "tw" : lane === EffectDocsLane.Css ? "css" : "dss";
	const apiImport = `import { ${api} } from "${relativeModuleImport(importFile, "proof/pandwind", api)}";`;
	const cxImport = `import { cx } from "${relativeModuleImport(importFile, "proof/pandwind", "cx")}";`;
	const frontmatter = code.startsWith("---") ? code.indexOf("\n---", 3) : -1;
	if (frontmatter !== -1) {
		const insertion = `\n${apiImport}${needsCx ? `\n${cxImport}` : ""}`;
		code = `${code.slice(0, frontmatter)}${insertion}${code.slice(frontmatter)}`;
	} else {
		code = `---\n${apiImport}${needsCx ? `\n${cxImport}` : ""}\n---\n${code}`;
	}
	return { code, changed: true, converted, unmappedTokens, skippedByMarker: 0 };
}

function applyEdits(
	source: string,
	edits: Array<{ start: number; end: number; text: string }>,
): string {
	let output = source;
	for (const edit of [...edits].toSorted((left, right) => right.start - left.start))
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	return output;
}

function transformFile(
	lane: EffectDocsLane,
	source: string,
	file: string,
	meta: PandwindMeta,
	root: string,
	files: readonly string[],
): Promise<CorpusTransformResult> {
	if (file.endsWith(".astro"))
		return Promise.resolve(applyAstroLane(source, file, file, lane, meta));
	const dialect =
		lane === EffectDocsLane.Tw
			? SwapSourceId.Tw
			: lane === EffectDocsLane.Css
				? SwapSourceId.Css
				: SwapSourceId.Dss;
	const project =
		lane === EffectDocsLane.Tw
			? { twModule: "proof/pandwind/tw.ts", cxModule: "proof/pandwind/cx.ts" }
			: lane === EffectDocsLane.Css
				? { cssModule: "proof/pandwind/css.ts", cxModule: "proof/pandwind/cx.ts" }
				: { dssModule: "proof/pandwind/dss.ts", cxModule: "proof/pandwind/cx.ts" };
	return migrateRegisteredFile({
		source,
		file,
		root,
		files,
		meta,
		from: CodemodAdapterId.Tailwind,
		to: `${CodemodAdapterId.Pandwind}:${dialect}`,
		project,
	});
}

function supportFiles(lane: EffectDocsLane): Record<string, string> {
	const twSource = readCheckedIn(join(metadataRoot, "tw.ts"));
	const typesSource = readCheckedIn(join(metadataRoot, "types.d.ts"));
	const bridgeSource = readCheckedIn(join(metadataRoot, "bridge.ts"));
	const files: Record<string, string> = {
		"proof/pandwind/tw.generated.ts": twSource,
		"proof/pandwind/types.d.ts": typesSource,
		"proof/pandwind/bridge.ts": bridgeSource,
		"proof/pandwind/tw.ts": [
			'import { createTw, type TwOptions } from "pandwind/tw";',
			'import type { WindVariants } from "./types";',
			'import { __pandwindConfig as generatedConfig } from "./tw.generated";',
			"",
			"// The original utility vocabulary remains authoritative for cascade order.",
			"export const __pandwindConfig: TwOptions = { variants: generatedConfig.variants };",
			"export const tw = createTw<WindVariants>(__pandwindConfig);",
			"",
		].join("\n"),
		"proof/pandwind/cx.ts":
			'import { createCx } from "pandwind/cx";\nimport { __pandwindConfig } from "./tw";\n\nexport const cx = createCx(__pandwindConfig);\n',
	};
	if (lane === EffectDocsLane.Css)
		files["proof/pandwind/css.ts"] =
			'import { createCss } from "pandwind/css";\nimport { examplePreset } from "@pandwind/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const css = createCss(examplePreset, { className: twAdapter });\n';
	if (lane === EffectDocsLane.DesignCss)
		files["proof/pandwind/dss.ts"] =
			'import { createDesignCss } from "pandwind/design";\nimport { examplePreset } from "@pandwind/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const dss = createDesignCss(examplePreset, { className: twAdapter });\n';
	return files;
}

async function copyReference(referenceRoot: string, outputRoot: string): Promise<void> {
	await cp(referenceRoot, outputRoot, {
		recursive: true,
		filter: (source) =>
			!source.endsWith("/.git") &&
			!source.includes("/.git/") &&
			!source.includes("/node_modules/") &&
			!source.includes("/.astro/") &&
			!source.includes("/dist/"),
	});
}

function collectTokens(source: string, into: Set<string>): void {
	for (const match of source.matchAll(
		/\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g,
	)) {
		const value = match[1] ?? match[2] ?? match[3] ?? "";
		for (const token of tokenizeClassList(value)) into.add(token);
	}
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: EffectDocsLane,
	changed: ReadonlyMap<string, string>,
	tokens: ReadonlySet<string>,
): Promise<void> {
	await rm(outputRoot, { recursive: true, force: true });
	await copyReference(referenceRoot, outputRoot);
	if (lane === EffectDocsLane.Tw) {
		const globalCssPath = join(outputRoot, "apps/web/src/styles/global.css");
		const globalCss = await readFile(globalCssPath, "utf8");
		if (!globalCss.includes('@source not inline("shadow blur")')) {
			await writeFile(
				globalCssPath,
				globalCss.replace(
					'@import "tailwindcss";',
					'@import "tailwindcss";\n@source not inline("shadow blur");',
				),
			);
		}
	}
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
	const packagePath = join(outputRoot, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
	await mkdir(join(outputRoot, "apps/web/src/pandwind"), { recursive: true });
	await writeFile(
		join(outputRoot, "apps/web/src/pandwind/source-tokens.ts"),
		`export const effectSourceTokens = ${JSON.stringify([...tokens].toSorted().join(" "))};\n`,
	);
	console.log(`materialized ${lane} lane at ${outputRoot}`);
}

async function main(): Promise<void> {
	const [laneName = EffectDocsLane.Tw, outputRoot = "/tmp/pandwind-effect-tw"] =
		process.argv.slice(2);
	const lane = laneName as EffectDocsLane;
	if (!Object.values(EffectDocsLane).includes(lane))
		throw new Error(`unsupported Effect lane: ${laneName}`);
	const referenceRoot = process.env.PANDWIND_EFFECT_REFERENCE ?? defaultReferenceRoot;
	const sourceRoot = join(referenceRoot, "apps/web/src");
	const files = await sourceFiles(sourceRoot);
	const meta = metadata();
	const changed = new Map<string, string>();
	const tokens = new Set<string>();
	const residuals: EffectDocsMigrationReport["residuals"] = [];
	let convertedCallSites = 0;
	let sourceBytes = 0;
	let outputBytes = 0;
	for (const absolute of files) {
		const relativeFile = relative(join(referenceRoot, "apps/web"), absolute).replaceAll("\\", "/");
		const file = join("apps/web", relativeFile).replaceAll("\\", "/");
		const source = await readFile(absolute, "utf8");
		collectTokens(source, tokens);
		const result = await transformFile(lane, source, file, meta, referenceRoot, files);
		sourceBytes += Buffer.byteLength(source);
		outputBytes += Buffer.byteLength(result.code);
		convertedCallSites += result.converted;
		residuals.push(...result.unmappedTokens);
		if (result.changed) changed.set(file, result.code);
	}
	await materialize(referenceRoot, outputRoot, lane, changed, tokens);
	const { stdout: referenceCommit } = await execFileAsync("git", [
		"-C",
		referenceRoot,
		"rev-parse",
		"HEAD",
	]);
	if (referenceCommit.trim() !== expectedReferenceCommit)
		throw new Error(
			`Effect reference drifted: expected ${expectedReferenceCommit}, found ${referenceCommit.trim()}`,
		);
	const report: EffectDocsMigrationReport = {
		lane,
		referenceCommit: referenceCommit.trim(),
		sourceFiles: files.length,
		changedFiles: changed.size,
		convertedCallSites,
		residualCount: residuals.length,
		residuals,
		sourceBytes,
		outputBytes,
		outputByteDelta: outputBytes - sourceBytes,
	};
	console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) await main();
