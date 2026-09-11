import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { runAdapterMigrationAsync, type AdapterMigrationResult } from "pandwind-codemod/swap";
import { CodemodAdapterId } from "pandwind-codemod/swap/identifiers";

export enum StylexDocsLane {
	RuntimeCss = "runtime-css",
	AtomicCss = "atomic-css",
	DesignDss = "design-dss",
}

enum StylexDocsMode {
	Atomic = "atomic",
	Design = "design",
}

export interface StylexDocsLaneReport {
	readonly lane: StylexDocsLane;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly invalidValidations: number;
	readonly outputBytes: number;
}

interface StylexDocsMigrationLane {
	readonly id: StylexDocsLane;
	migrate(source: string, context: { file: string; root: string }): Promise<AdapterMigrationResult>;
}

const execFileAsync = promisify(execFile);

async function ensureRuntimeHost(outputRoot: string): Promise<void> {
	const file = join(outputRoot, "src/pages/_layout.tsx");
	let source = await readFile(file, "utf8");
	if (!source.includes("data-pandwind-runtime")) {
		source = source.replace(
			"import coverImageUrl from '@/static/img/stylex-cover-photo.png';",
			'import coverImageUrl from \'@/static/img/stylex-cover-photo.png\';\nimport { createRuntimeCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\n\nconst pandwindRuntime = createRuntimeCss(pandwindPreset);\n\nfunction PandwindRuntimeStyles() {\n  const css = pandwindRuntime.sheet.css().replaceAll("</style", "<\\\\/style");\n  return css === "" ? null : <style data-pandwind-runtime dangerouslySetInnerHTML={{ __html: css }} />;\n}',
		);
		source = source.replace(
			"      </Provider>\n",
			"      </Provider>\n      <PandwindRuntimeStyles />\n",
		);
		source = source.replace(
			"<style data-pandwind-runtime",
			'<style data-pandwind-sheet="pandwind" data-pandwind-runtime',
		);
		source = source.replace(
			/import \{ createRuntimeCss \} from "pandwind\/css\/runtime";\nimport \{ pandwindPreset \} from "pandwind\/preset";\n\nconst pandwindRuntime = createRuntimeCss\(pandwindPreset\);\n\n/g,
			"",
		);
		source = source.replace(
			'import { pandwindRuntime } from "../pandwind-runtime";',
			'import "../pandwind-static.css";\nimport { pandwindRuntime } from "../pandwind-runtime";',
		);
		source = source.replace(
			"const css = pandwindRuntime.sheet.css().replaceAll",
			"const css = pandwindRuntime.sheet.css().replaceAll",
		);
		await writeFile(file, source);
	}
	if (source.includes("pandwindStaticCss")) {
		source = source.replace(
			'import pandwindStaticCss from "../pandwind-static.css?raw";\n',
			'import "../pandwind-static.css";\n',
		);
		source = source.replace(
			'const css = [pandwindStaticCss, pandwindRuntime.sheet.css()].filter(Boolean).join("\\n").replaceAll',
			"const css = pandwindRuntime.sheet.css().replaceAll",
		);
		await writeFile(file, source);
	}
}

async function ensureRuntimeModule(outputRoot: string): Promise<void> {
	await writeFile(
		join(outputRoot, "src/pandwind-runtime.ts"),
		'import { createRuntimeCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\n\nexport const pandwindRuntime = createRuntimeCss(pandwindPreset);\n',
	);
}

async function ensureRuntimeStaticCss(
	outputRoot: string,
	files: readonly string[],
	staticGroupCalls: readonly string[],
	lane: StylexDocsLane,
): Promise<void> {
	const imports = files
		.filter((file) => file !== "src/pandwind-runtime.ts")
		.map((file) => `import ${JSON.stringify(`./${file.slice(4)}`)};`)
		.join("\n");
	const factory =
		lane === StylexDocsLane.DesignDss
			? 'import { createRuntimeDesignCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\nconst dss = createRuntimeDesignCss(pandwindPreset, { sheet: pandwindRuntime.sheet });'
			: 'import { createRuntimeCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\nconst css = createRuntimeCss(pandwindPreset, { sheet: pandwindRuntime.sheet });';
	const api = lane === StylexDocsLane.DesignDss ? "dss" : "css";
	const groups = staticGroupCalls
		.map((call) => call.replace(/^\b(?:css|dss)\.group/, `${api}.group`))
		.join("\n");
	const collector = `import { pandwindRuntime } from "./pandwind-runtime";\n${factory}\n${imports}\n${groups}\nprocess.stdout.write(pandwindRuntime.sheet.css());\n`;
	const collectorFile = join(outputRoot, "src/pandwind-style-collector.ts");
	await writeFile(collectorFile, collector);
	const { stdout } = await execFileAsync("nub", [collectorFile], {
		cwd: outputRoot,
		maxBuffer: 16 * 1024 * 1024,
	});
	await writeFile(join(outputRoot, "src/pandwind-static.css"), stdout);
}

function runtimeModuleImport(root: string, file: string): string {
	const target = join(root, "src/pandwind-runtime");
	let specifier = relative(dirname(join(root, file)), target).replaceAll("\\", "/");
	if (!specifier.startsWith(".")) specifier = `./${specifier}`;
	return `import { pandwindRuntime } from ${JSON.stringify(specifier)};`;
}

function bindRuntimeSheet(source: string, root: string, file: string): string {
	let output = source;
	output = output.replace(
		'import { createCss } from "pandwind/css";',
		'import { createRuntimeCss } from "pandwind/css/runtime";',
	);
	output = output.replace(
		"const css = createCss();",
		"const css = createRuntimeCss(pandwindPreset, { sheet: pandwindRuntime.sheet });",
	);
	if (!output.includes("pandwindRuntime")) {
		output = `${runtimeModuleImport(root, file)}\n${output}`;
	}
	if (
		(output.includes("createRuntimeCss") || output.includes("createRuntimeDesignCss")) &&
		!output.includes('from "pandwind/preset"')
	) {
		output = `import { pandwindPreset } from "pandwind/preset";\n${output}`;
	}
	output = output.replace(
		/const css = createRuntimeCss\(pandwindPreset\);/g,
		"const css = createRuntimeCss(pandwindPreset, { sheet: pandwindRuntime.sheet });",
	);
	output = output.replace(
		/const dss = createRuntimeDesignCss\(pandwindPreset\);/g,
		"const dss = createRuntimeDesignCss(pandwindPreset, { sheet: pandwindRuntime.sheet });",
	);
	return output;
}

function splitObjectEntries(object: string): string[] {
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
		if (character === "{" || character === "[" || character === "(") depth++;
		if (character === "}" || character === "]" || character === ")") depth--;
		if (character === "," && depth === 0) {
			entries.push(object.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = object.slice(start, -1).trim();
	if (last !== "") entries.push(last);
	return entries;
}

function matchingCallEnd(source: string, open: number): number {
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
	return source.length - 1;
}

function extractStaticGroupCalls(source: string): string[] {
	return [...source.matchAll(/\b(?:css|dss)\.group\s*\(/g)].map((match) => {
		const start = match.index ?? 0;
		const open = start + match[0].lastIndexOf("(");
		return source.slice(start, matchingCallEnd(source, open) + 1);
	});
}

function objectEntrySeparator(entry: string): number {
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
		if (character === "[" || character === "(" || character === "{") depth++;
		else if (character === "]" || character === ")" || character === "}") depth--;
		else if (character === ":" && depth === 0) return index;
	}
	return -1;
}

function rewriteNamedGroups(source: string, mode: StylexDocsMode): string {
	let output = source;
	const calls = [...source.matchAll(/\bcss\.group\s*\(/g)].toReversed();
	for (const call of calls) {
		const start = call.index ?? 0;
		const open = start + call[0].lastIndexOf("(");
		const end = matchingCallEnd(output, open);
		const argument = output.slice(open + 1, end).trim();
		if (!argument.startsWith("{") || !argument.endsWith("}")) continue;
		const entries = splitObjectEntries(argument).map((entry) => {
			const separator = objectEntrySeparator(entry);
			if (separator < 0) return entry;
			const key = entry.slice(0, separator).trim();
			const value = entry.slice(separator + 1).trim();
			const functionValue = /^(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(
				value,
			);
			return mode === StylexDocsMode.Atomic
				? functionValue
					? `${key}: ${value}`
					: `${key}: ${value}`
				: functionValue
					? `${key}: ${value}`
					: `${key}: { $raw: ${value} }`;
		});
		const replacement = `css.group({ ${entries.join(", ")} })`;
		output = `${output.slice(0, start)}${replacement}${output.slice(end + 1)}`;
	}
	if (mode === StylexDocsMode.Design) {
		output = output.replaceAll(
			/import \{ create(?:Runtime)?Css \} from "pandwind\/css(?:\/runtime)?";/g,
			'import { createRuntimeDesignCss } from "pandwind/css/runtime";',
		);
		output = output.replaceAll(
			/const css = create(?:Runtime)?Css\(pandwindPreset\);/g,
			"const dss = createRuntimeDesignCss(pandwindPreset);",
		);
		output = output.replaceAll(/\bcss\./g, "dss.");
		if (!output.includes('from "pandwind/preset"')) {
			output = output.replace(
				'import { createRuntimeDesignCss } from "pandwind/css/runtime";',
				'import { createRuntimeDesignCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";',
			);
		}
	}
	return output;
}

function rewritePlaygroundTemplates(source: string, lane: StylexDocsLane): string {
	if (!source.includes("INITIAL_INPUT_FILES")) return source;
	let output = source.replace(
		"const css = createRuntimeCss(pandwindPreset, { sheet: pandwindRuntime.sheet });",
		"const css = createRuntimeCss(pandwindPreset);",
	);
	// The interactive sandbox still compiles its source with StyleX's Babel
	// plugin. Keep migrated token literals in the token-definition shape that
	// compiler understands so the preview exercises the same values as the
	// reference playground while the host page uses Pandwind.
	output = output.replaceAll(
		"export const colors = ({",
		"export const colors = stylex.defineVars({",
	);
	if (lane === StylexDocsLane.DesignDss) {
		output = output.replaceAll("createRuntimeCss", "createRuntimeDesignCss");
		output = output.replace(
			/const css = createRuntimeDesignCss\(pandwindPreset(?:, \{ sheet: pandwindRuntime\.sheet \})?\);/g,
			"const dss = createRuntimeDesignCss(pandwindPreset);",
		);
		output = output.replace(
			/const dss = createRuntimeDesignCss\(pandwindPreset, \{ sheet: pandwindRuntime\.sheet \}\);/g,
			"const dss = createRuntimeDesignCss(pandwindPreset);",
		);
		output = output.replaceAll(/\bcss\./g, "dss.");
	}
	if (!output.includes("/node_modules/pandwind/package.json")) {
		const runtime = `import * as stylex from "@stylexjs/stylex";\nconst props = (...styles) => { const result = stylex.props(...styles); return result.style === undefined ? result : { ...result, style: undefined }; };\nconst css = { ...stylex, props };\nexport const createRuntimeCss = () => css;\nexport const createRuntimeDesignCss = () => css;`;
		const index = `import * as stylex from "@stylexjs/stylex";\nconst props = (...styles) => { const result = stylex.props(...styles); return result.style === undefined ? result : { ...result, style: undefined }; };\nexport const css = { ...stylex, props };\nexport const createCss = () => css;\nexport const createRuntimeCss = () => css;\nexport const createRuntimeDesignCss = () => css;`;
		const preset = "export const pandwindPreset = {};";
		const virtualFiles = [
			[
				"  '/node_modules/pandwind/package.json': {",
				`    code: ${JSON.stringify(JSON.stringify({ name: "pandwind", main: "./index.js" }, null, 2))},`,
				"  },",
			],
			["  '/node_modules/pandwind/index.js': {", `    code: ${JSON.stringify(index)},`, "  },"],
			[
				"  '/node_modules/pandwind/css/runtime.js': {",
				`    code: ${JSON.stringify(runtime)},`,
				"  },",
			],
			["  '/node_modules/pandwind/preset.js': {", `    code: ${JSON.stringify(preset)},`, "  },"],
		]
			.flat()
			.join("\n");
		output = output.replace(
			"  '/node_modules/@stylexjs/stylex/package.json': {",
			`${virtualFiles}\n  '/node_modules/@stylexjs/stylex/package.json': {`,
		);
	}
	output = output.replace(
		'import * as stylex from "@stylexjs/stylex";\n\nexport default function Logo',
		lane === StylexDocsLane.DesignDss
			? 'import * as stylex from "@stylexjs/stylex";\nimport { createRuntimeDesignCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\nconst dss = createRuntimeDesignCss(pandwindPreset);\n\nexport default function Logo'
			: 'import * as stylex from "@stylexjs/stylex";\nimport { createRuntimeCss } from "pandwind/css/runtime";\nimport { pandwindPreset } from "pandwind/preset";\nconst css = createRuntimeCss(pandwindPreset);\n\nexport default function Logo',
	);
	return output;
}

function createLane(id: StylexDocsLane): StylexDocsMigrationLane {
	return {
		id,
		async migrate(source, context) {
			const result = await runAdapterMigrationAsync(source, {
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: context.file,
				root: context.root,
				mode: "safe",
				semantic: { source: { file: context.file, framework: "react" } },
			});
			if (id === StylexDocsLane.RuntimeCss) return result;
			return {
				...result,
				code: rewriteNamedGroups(
					result.code,
					id === StylexDocsLane.AtomicCss ? StylexDocsMode.Atomic : StylexDocsMode.Design,
				),
			};
		},
	};
}

export class StylexDocsMigration {
	static readonly lanes: readonly StylexDocsMigrationLane[] = [
		createLane(StylexDocsLane.RuntimeCss),
		createLane(StylexDocsLane.AtomicCss),
		createLane(StylexDocsLane.DesignDss),
	];

	static async run(
		root: string,
		laneId: StylexDocsLane,
		outputRoot?: string,
	): Promise<StylexDocsLaneReport> {
		const lane = this.lanes.find((candidate) => candidate.id === laneId);
		if (lane === undefined) throw new Error(`Unknown StyleX docs lane: ${laneId}`);
		const sourceRoot = resolve(root, "src");
		const files: string[] = [];
		const visit = async (directory: string): Promise<void> => {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const file = join(directory, entry.name);
				if (entry.isDirectory()) await visit(file);
				else if (/\.(?:[cm]?[jt]sx?|mdx?)$/.test(entry.name)) files.push(file);
			}
		};
		await visit(sourceRoot);
		let sourceFiles = 0;
		let changedFiles = 0;
		let converted = 0;
		let skipped = 0;
		let residuals = 0;
		let invalidValidations = 0;
		let outputBytes = 0;
		const runtimeFiles: string[] = [];
		const staticGroupCalls: string[] = [];
		for (const absoluteFile of files.toSorted()) {
			const source = await readFile(absoluteFile, "utf8");
			if (!source.includes("stylex")) continue;
			sourceFiles++;
			const file = relative(root, absoluteFile);
			// Each file is transformed in source order for deterministic reports.
			const result = await lane.migrate(source, { file, root });
			if (result.changed) changedFiles++;
			converted += result.converted;
			skipped += result.skipped;
			residuals += result.residuals.length;
			invalidValidations += result.validations.filter((validation) => !validation.valid).length;
			outputBytes += Buffer.byteLength(result.code);
			if (outputRoot !== undefined) {
				if (file.startsWith("src/pages/(playground)/")) {
					staticGroupCalls.push(...extractStaticGroupCalls(result.code));
				}
				const outputFile = join(outputRoot, file);
				await mkdir(resolve(outputFile, ".."), { recursive: true });
				const code = rewritePlaygroundTemplates(bindRuntimeSheet(result.code, root, file), laneId);
				if (
					code.includes("pandwindRuntime") &&
					file !== "src/pages/_layout.tsx" &&
					!file.startsWith("src/pages/blog/") &&
					!file.startsWith("src/pages/(playground)/") &&
					!file.startsWith("src/components/Playground/") &&
					!/(?:use-query-params|@codesandbox|@monaco-editor|@babel\/standalone|\bwaku\b|fumadocs)/.test(
						code,
					) &&
					!/\.(?:css|mdx|png|jpe?g|svg)(?:[?"'\s;])/.test(code)
				)
					runtimeFiles.push(file);
				await writeFile(outputFile, code);
			}
		}
		if (outputRoot !== undefined) {
			await ensureRuntimeModule(outputRoot);
			await ensureRuntimeStaticCss(outputRoot, runtimeFiles, staticGroupCalls, laneId);
			await ensureRuntimeHost(outputRoot);
		}
		return {
			lane: laneId,
			sourceFiles,
			changedFiles,
			converted,
			skipped,
			residuals,
			invalidValidations,
			outputBytes,
		};
	}
}
