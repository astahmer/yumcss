import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import {
	CodemodAdapterId,
	StyleProgramResidualKindTag,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "@yumcss/codemod/swap";
import { createReferenceWorkspace } from "../reference-workspace.ts";

/** Public migration lanes for the pinned Astryx docsite corpus. */
export enum AstryxDocsLane {
	RuntimeCss = "runtime-css",
	StaticCss = "static-css",
	DesignDss = "design-dss",
}

export interface AstryxDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

export interface AstryxDocsLaneReport {
	readonly schema: "yumcss.astryx-docs-migration/1";
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

const repositoryRoot = resolve(import.meta.dirname, "../..");
const defaultReferenceRoot = createReferenceWorkspace().path("astryx/apps/docsite");
const stylexAdapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.StyleX);

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
		else if ("}])".includes(character)) depth--;
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
		else if ("}])".includes(character)) depth--;
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
		for (const match of [
			...output.matchAll(new RegExp(`\\b${call.replace(".", "\\.")}\\s*\\(`, "g")),
		].toReversed()) {
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
				if (/^(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(value))
					return entry;
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
		/import \{ createUnsafeCss \} from "yumcss\/unsafe\/css";/g,
		'import { createDesignCss } from "yumcss/design";\nimport { defaultPreset } from "yumcss/preset/default";',
	);
	output = output.replace(
		/((?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)createUnsafeCss\(\);/g,
		"$1createDesignCss(defaultPreset);",
	);
	return output;
}

function useRuntimeApi(source: string): string {
	return source
		.replace(
			/import \{ createUnsafeCss \} from "yumcss\/unsafe\/css";/g,
			'import { createRuntimeCss } from "yumcss/css/runtime";\nimport { defaultPreset } from "yumcss/preset/default";',
		)
		.replace(
			/((?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)createUnsafeCss\(\);/g,
			"$1createRuntimeCss({ ...defaultPreset, _config: {} as Record<string, unknown>, strict: false, properties: { $all: true } });",
		);
}

function createLaneAdapter(lane: AstryxDocsLane): AstryxLaneAdapter {
	return {
		lane,
		transform(source, context) {
			const result = runAdapterMigration(source, {
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.YumCSS,
				file: context.file,
				root: context.root,
				mode: "safe",
				semantic: { source: { file: context.file, framework: "react" } },
			});
			if (lane === AstryxDocsLane.DesignDss) return { ...result, code: useDesignApi(result.code) };
			if (
				lane === AstryxDocsLane.RuntimeCss &&
				result.residuals.some(
					(residual) => residual.kind === StyleProgramResidualKindTag.DynamicValues,
				)
			)
				return { ...result, code: useRuntimeApi(result.code) };
			return result;
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
	const templateRoot = join(resolve(root, "../.."), "packages/cli/assets/templates/pages");
	try {
		await visit(templateRoot);
	} catch {
		// The standalone docsite checkout does not carry Astryx's template package.
		// The repository corpus does, and includes it in the migration when present.
	}
	return files.toSorted();
}

function rewriteRequired(
	source: string,
	pattern: RegExp,
	replacement: string,
	file: string,
): string {
	if (!pattern.test(source)) throw new Error(`Astryx static lowering pattern not found in ${file}`);
	return source.replace(pattern, replacement);
}

/**
 * Lower the few source-level dynamic carriers that the StyleX adapter cannot
 * represent as static YumCSS rules. Their values are already ordinary host
 * styles; retaining them as `style` props keeps the dynamic boundary explicit
 * without keeping the StyleX compiler in the migrated application.
 */
function lowerAstryxDynamicHosts(source: string, file: string): string {
	let output = source;
	if (file.endsWith("src/app/playground/PreviewStage.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/\/\/ Runtime sizing — the preview frame is a fixed device size or fills its area\.\nconst dynamic =[\s\S]*?\ninterface PreviewStageProps/,
			"interface PreviewStageProps",
			file,
		);
		output = rewriteRequired(
			output,
			/,\n\s*dynamic\.size\(width, height\),\n\s*\]}\s*>/,
			"\n        ]}\n        style={{width, height}}>",
			file,
		);
	}
	if (file.endsWith("src/components/ThemeShowcaseTile.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/ReturnType<typeof stylex\.props>/,
			"ReturnType<typeof css.props>",
			file,
		);
	}
	if (file.endsWith("packages/cli/assets/templates/pages/kanban-board/page.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/const styles = \/\/ yumcss:migrate-skip \(dynamic values require a host-bound style carrier\)\nstylex\.create\(/,
			"const styles = css.group(",
			file,
		);
		output = rewriteRequired(
			output,
			/\n  floatingAt: \(x: number, y: number, width: number\) => \(\{[\s\S]*?\n  \}\),/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/\n  ghost: \(height: number\) => \(\{[\s\S]*?\n  \}\),/,
			"\n  ghost: {\n    borderRadius: 'var(--radius-container)',\n    backgroundColor: 'var(--color-background-muted)',\n  },",
			file,
		);
		output = rewriteRequired(
			output,
			/\n\}\);\n\n\/\/ ============= CARD BODY/,
			"\n});\n\nconst dynamicStyles = {\n  floatingAt: (x: number, y: number, width: number) => ({\n    width,\n    transform: `translate(${x}px, ${y}px)`,\n  }),\n  ghost: (height: number) => ({height}),\n};\n\n// ============= CARD BODY",
			file,
		);
		output = rewriteRequired(
			output,
			/className=\{css\.props\(styles\.ghost\(ghostTarget\.height\)\)\.className\}/,
			"className={css.props(styles.ghost).className}\n          style={dynamicStyles.ghost(ghostTarget.height)}",
			file,
		);
		output = rewriteRequired(
			output,
			/\n\s*styles\.floatingAt\([\s\S]*?\n\s*\),\n\s*\]\)\.className\}/,
			"\n          ]).className}",
			file,
		);
		output = rewriteRequired(
			output,
			/className=\{css\.props\(\[\s*styles\.floating,\s*\]\)\.className\}>/,
			"className={css.props([styles.floating]).className}\n          style={dynamicStyles.floatingAt(\n            drag.pointerX - drag.offsetX,\n            drag.pointerY - drag.offsetY,\n            drag.width,\n          )}>",
			file,
		);
	}
	if (file.endsWith("packages/cli/assets/templates/pages/settings-dialog/page.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/const row = \/\/ yumcss:migrate-skip \(dynamic values require a host-bound style carrier\)\nstylex\.create\(/,
			"const row = css.group(",
			file,
		);
		output = output.replaceAll("[ROW_STACK]", "'@container settings-panel (max-width: 480px)'");
	}
	if (file.endsWith("packages/cli/assets/templates/pages/dashboard-data/page.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = rewriteRequired(
			output,
			/const metricsGridStyles = \/\/ yumcss:migrate-skip \(dynamic values require a host-bound style carrier\)\nstylex\.create\(/,
			"const metricsGridStyles = css.group(",
			file,
		);
		output = output.replaceAll("[METRICS_WIDE]", "'@media (min-width: 900px)'");
	}
	if (file.endsWith("packages/cli/assets/templates/pages/table-filter/page.tsx")) {
		output = rewriteRequired(
			output,
			/import \* as stylex from ['"]@stylexjs\/stylex['"];\n/,
			"",
			file,
		);
		output = output.replaceAll(
			"const styles = // yumcss:migrate-skip (dynamic values require a host-bound style carrier)\nstylex.create(",
			"const styles = css.group(",
		);
		output = output.replaceAll(
			"const reorderStyles = // yumcss:migrate-skip (dynamic values require a host-bound style carrier)\nstylex.create(",
			"const reorderStyles = css.group(",
		);
		output = output.replace(
			"const skeletonCell = // yumcss:migrate-skip (dynamic values require a host-bound style carrier)\nstylex.create({",
			"const skeletonCell = {",
		);
		output = rewriteRequired(
			output,
			/\n\}\);\n\n\/\*\* Placeholder rows standing in for the batch being fetched\. \*\//,
			"\n};\n\n/** Placeholder rows standing in for the batch being fetched. */",
			file,
		);
		output = rewriteRequired(
			output,
			/className=\{css\.props\(\[styles\.skeletonRow, skeletonCell\.row\(pad\)\]\)\.className\}/,
			"className={css.props(styles.skeletonRow).className}\n          style={skeletonCell.row(pad)}",
			file,
		);
		output = rewriteRequired(
			output,
			/className=\{css\.props\(\[\n\s*skeletonCell\.fixed\(SELECTION_COLUMN_WIDTH, 0\),\n\s*styles\.skeletonEdgeStart,\n\s*\]\)\.className\}/,
			"className={css.props(styles.skeletonEdgeStart).className}\n            style={skeletonCell.fixed(SELECTION_COLUMN_WIDTH, 0)}",
			file,
		);
		output = rewriteRequired(
			output,
			/className=\{css\.props\(\[\n\s*col\.width\?\.type === 'pixel'[\s\S]*?\n\s*index === columns\.length - 1 && styles\.skeletonEdgeEnd,\n\s*\]\)\.className\}/,
			"className={\n                index === columns.length - 1\n                  ? css.props(styles.skeletonEdgeEnd).className\n                  : undefined\n              }\n              style={\n                col.width?.type === 'pixel'\n                  ? skeletonCell.fixed(col.width.value, pad)\n                  : skeletonCell.flexible(\n                      col.width?.value ?? 1,\n                      col.width?.minWidth ?? 120,\n                      pad,\n                    )\n              }",
			file,
		);
	}
	return output;
}

function hasAstryxDynamicHostFallback(file: string): boolean {
	return [
		"src/app/playground/PreviewStage.tsx",
		"packages/cli/assets/templates/pages/dashboard-data/page.tsx",
		"packages/cli/assets/templates/pages/kanban-board/page.tsx",
		"packages/cli/assets/templates/pages/settings-dialog/page.tsx",
		"packages/cli/assets/templates/pages/table-filter/page.tsx",
	].some((suffix) => file.endsWith(suffix));
}

function installStaticExtractorConfig(outputRoot: string): Promise<void> {
	return (async () => {
		await Promise.all([
			(async () => {
				const configFile = join(outputRoot, "next.config.mjs");
				let config = await readFile(configFile, "utf8");
				if (!config.includes("yumcssWebpackCss")) {
					config = `import { yumcssWebpackCss } from "yumcss/unplugin";\nimport { defaultPreset } from "yumcss/preset/default";\nconst cssPlugin = yumcssWebpackCss({ preset: defaultPreset, root: resolve(import.meta.dirname, "../.."), cssSources: [/yumcss\\/(?:css|design)/], exclude: [/node_modules/, /(^|\\/)dist(\\/|$)/, /\\.git/, /src\\/generated\\/examples/] });\n${config}`;
					config = config.replace(
						"    return config;",
						"    config.plugins.push(cssPlugin);\n    return config;",
					);
				}
				await writeFile(configFile, config);
			})(),
			(async () => {
				const layoutFile = join(outputRoot, "src/app/layout.tsx");
				let layout = await readFile(layoutFile, "utf8");
				if (!layout.includes('"yumcss:css"')) {
					layout = layout.replace(
						"import './globals.css';",
						"import './globals.css';\nimport 'yumcss:css';",
					);
					layout = layout.replace(
						'import "./globals.css";',
						'import "./globals.css";\nimport "yumcss:css";',
					);
				}
				await writeFile(layoutFile, layout);
			})(),
			(async () => {
				await writeFile(
					join(outputRoot, "src/yumcss-css.d.ts"),
					'declare module "yumcss:css";\n',
				);
			})(),
			(async () => {
				const tsconfigFile = join(outputRoot, "tsconfig.json");
				let tsconfig = await readFile(tsconfigFile, "utf8");
				if (!tsconfig.includes('"allowImportingTsExtensions"'))
					tsconfig = tsconfig.replace(
						'"allowJs": true,',
						'"allowJs": true,\n    "allowImportingTsExtensions": true,',
					);
				await writeFile(tsconfigFile, tsconfig);
			})(),
			(async () => {
				const babelFile = join(outputRoot, "babel.config.js");
				let babel = await readFile(babelFile, "utf8");
				babel = babel.replace(/\nconst path = require\('node:path'\);\n/, "\n");
				babel = babel.replace(/\nconst dev = process\.env\.NODE_ENV !== 'production';\n/, "\n");
				babel = babel.replace(/\n  plugins: \[[\s\S]*?\n  \],\n/, "\n  plugins: [],\n");
				await writeFile(babelFile, babel);
			})(),
		]);
		const packageFile = join(outputRoot, "package.json");
		const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
			dependencies?: Record<string, string>;
		};
		packageJson.dependencies = {
			...packageJson.dependencies,
			yumcss: `file:${repositoryRoot}/packages/yumcss`,
		};
		await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	})();
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
		const residualDetails: Array<AstryxDocsLaneReport["residualDetails"][number]> = [];
		for (const absoluteFile of files) {
			const source = await readFile(absoluteFile, "utf8");
			const file = relative(referenceRoot, absoluteFile);
			if (stylexAdapter?.detect({ file, source, root: referenceRoot }).matched !== true) continue;
			sourceBytes += Buffer.byteLength(source);
			const transformed = adapter.transform(source, { file: absoluteFile, root: referenceRoot });
			const loweredCode = lowerAstryxDynamicHosts(transformed.code, file);
			const result = {
				...transformed,
				code: loweredCode,
				residuals: transformed.residuals.filter(
					(residual) =>
						residual.kind !== StyleProgramResidualKindTag.DynamicValues ||
						loweredCode.includes("stylex.create"),
				),
			};
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			skippedCallSites += result.skipped;
			residuals += result.residuals.length;
			staticCallSites += result.converted;
			staticCssCallSites += result.code.includes("createRuntimeCss") ? 0 : result.converted;
			const needsRuntimeFallback =
				(lane !== AstryxDocsLane.RuntimeCss && result.code.includes("createRuntimeCss")) ||
				result.residuals.some(
					(residual) => residual.kind === StyleProgramResidualKindTag.DynamicValues,
				) ||
				hasAstryxDynamicHostFallback(file);
			if (needsRuntimeFallback) {
				runtimeFallbackFiles++;
				if (!runtimeFallbackFileNames.includes(file)) runtimeFallbackFileNames.push(file);
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
		if (outputRoot !== undefined) await installStaticExtractorConfig(outputRoot);
		const report: AstryxDocsLaneReport = {
			schema: "yumcss.astryx-docs-migration/1",
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
			staticExtractionRatio:
				staticCallSites + skippedCallSites === 0
					? 1
					: staticCallSites / (staticCallSites + skippedCallSites),
			staticCssCoverageRatio:
				staticCssCallSites + skippedCallSites === 0
					? 1
					: staticCssCallSites / (staticCssCallSites + skippedCallSites),
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			residualDetails,
		};
		if (outputRoot !== undefined)
			await writeFile(
				join(outputRoot, `yumcss-${lane}.json`),
				`${JSON.stringify(report, null, 2)}\n`,
			);
		return report;
	}
}
