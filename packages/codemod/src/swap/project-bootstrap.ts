import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPandwindInteropArtifact } from "pandwind/tw/interop";
import { generateUtilityBridge, BRIDGE_PROPS, type UtilityBridge } from "pandwind/codegen/bridge";
import { generateDesignSystem } from "pandwind/codegen/types";
import { buildThemeBlock } from "pandwind/codegen/theme";
import { extractTwConfig } from "pandwind/vite/inline";
import type {
	AdapterConfigContext,
	AdapterGeneratedFile,
	AdapterProjectConfig,
	AdapterProjectBindings,
} from "./adapter-contract.ts";
import type { PandwindMeta } from "../meta.ts";
import { loadMetaFromSources } from "../meta.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import { CodemodAdapterId } from "./identifiers.ts";

export interface ProjectBootstrapRequest {
	readonly root: string;
	readonly sourceAdapter: string;
	readonly outputDirectory: string;
	readonly readFile: (file: string) => string | undefined;
	readonly listFiles: (root: string) => readonly string[];
	readonly packageJson?: Readonly<Record<string, unknown>>;
}

export interface PandwindProjectSupport {
	readonly metaDirectory: string;
	readonly bindings: AdapterProjectBindings;
	readonly files: readonly AdapterGeneratedFile[];
	/** Existing source files that the target project no longer needs to load. */
	readonly fileChanges: readonly {
		readonly path: string;
		readonly content: string;
		readonly expectedContent?: string;
	}[];
	readonly meta?: PandwindMeta;
	readonly sourceConfig: AdapterProjectConfig;
}

const posixPath = (value: string): string => value.replaceAll("\\", "/");

const projectFile = (directory: string, name: string): string =>
	posixPath(join(directory.replaceAll("\\", "/"), name));

const scalarTokenValues = (config: AdapterProjectConfig): Set<string> =>
	new Set(
		Object.values(config.tokenCatalog?.groups ?? {}).flatMap((group) => Object.values(group)),
	);

function customVariantConditions(css: string): Record<string, string> {
	const conditions: Record<string, string> = {};
	for (const line of css.split("\n")) {
		const match = /^\s*@custom-variant\s+([\w-]+)\s*\((.*)\)\s*;\s*$/u.exec(line);
		if (match?.[1] !== undefined && match[2] !== undefined) conditions[match[1]] = match[2].trim();
	}
	return conditions;
}

function isTailwindOnlyStylesheet(css: string): boolean {
	const source = css.replace(/\/\*[\s\S]*?\*\//gu, "").trim();
	return /^@import\s+(?:url\(\s*)?["']tailwindcss["']\s*\)?\s*;$/u.test(source);
}

function stylesheetImportTarget(file: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	return resolve(dirname(file), specifier);
}

function removeTailwindStylesheetImports(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
	outputDirectory: string,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.Tailwind) return [];
	const cssEntry = config.files.find((file) => /\.css$/u.test(file));
	if (cssEntry === undefined) return [];
	const stylesheet = request.readFile(cssEntry);
	if (stylesheet === undefined || !isTailwindOnlyStylesheet(stylesheet)) return [];
	const target = resolve(request.root, cssEntry);
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined) continue;
		const next = source.replace(
			/^[ \t]*import\s*["']([^"']+\.css)["']\s*;?[ \t]*$/gmu,
			(statement, specifier: string) =>
				stylesheetImportTarget(absoluteFile, specifier) === target ? "" : statement,
		);
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function rewriteTailwindViteConfigs(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
	outputDirectory: string,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.Tailwind) return [];
	const presetPath = resolve(request.root, outputDirectory, "preset");
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/(?:^|\/)vite\.config\.[cm]?[jt]s$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined || !source.includes("@tailwindcss/vite")) continue;
		if (!/\btailwindcss\s*\(\s*\)/u.test(source)) continue;
		const presetSpecifier = relative(dirname(absoluteFile), presetPath).replaceAll("\\", "/");
		const normalizedSpecifier = presetSpecifier.startsWith(".")
			? presetSpecifier
			: `./${presetSpecifier}`;
		const next = source
			.replace(
				/import\s+tailwindcss\s+from\s+["']@tailwindcss\/vite["'];?/u,
				`import { pandwindCssVite } from "pandwind/vite";\nimport { pandwindPreset } from "${normalizedSpecifier}";`,
			)
			.replace(/\btailwindcss\s*\(\s*\)/gu, 'pandwindCssVite(pandwindPreset, { root: "." })');
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function presetSource(
	config: AdapterProjectConfig,
	conditions: Readonly<Record<string, string>>,
): string {
	return `import { definePreset } from "pandwind/preset";

export const pandwindPreset = definePreset(
	{
		config: {} as import("pandwind/preset").AnyCssConfig,
		tokens: ${JSON.stringify(config.tokenCatalog?.groups ?? {}, null, "\t")},
	},
	{
		strict: true,
		conditions: ${JSON.stringify(conditions, null, "\t")},
		properties: { $all: true },
	},
);
`;
}

function cssSource(): string {
	return `import { createCss } from "pandwind/css";
import { pandwindPreset } from "./preset";

export const css = createCss(pandwindPreset);
`;
}

function runtimeCssSource(): string {
	return `import { createRuntimeCss } from "pandwind/css/runtime";
import { pandwindPreset } from "./preset";

export const css = createRuntimeCss(pandwindPreset);
`;
}

function dssSource(): string {
	return `import { createDesignCss } from "pandwind/design";
import { pandwindPreset } from "./preset";

export const dss = createDesignCss(pandwindPreset);
`;
}

function cxSource(): string {
	return `import { createCx } from "pandwind/cx";
import { css } from "./css";

export const cx = createCx({ css });
`;
}

function bridgeSource(bridge: UtilityBridge, twSource: string, presetImport: string): string {
	const config = extractTwConfig(twSource);
	if (config === undefined) throw new Error("codemod: generated tw config is not readable");
	return `import { createTwAdapter } from "pandwind/tw";
import { pandwindPreset } from "${presetImport}";

export const bridge = ${JSON.stringify(bridge)} as const;
export const variants = ${JSON.stringify(config.variants)} as const;
export const twAdapter = createTwAdapter({
	preset: pandwindPreset,
	variants,
	bridge,
});
`;
}

function generatedFile(path: string, content: string, purpose: string): AdapterGeneratedFile {
	return { path, content, purpose };
}

async function loadSourceConfig(request: ProjectBootstrapRequest): Promise<AdapterProjectConfig> {
	const catalog = createBuiltinCodemodCatalog();
	const adapter = catalog.registry.get(request.sourceAdapter);
	if (adapter === undefined)
		return {
			adapter: request.sourceAdapter,
			root: request.root,
			files: [],
			values: {},
		};
	const context: AdapterConfigContext = {
		file: "project",
		source: "",
		root: request.root,
		...(request.packageJson === undefined ? {} : { packageJson: request.packageJson }),
		readFile: request.readFile,
		listFiles: request.listFiles,
	};
	return adapter.loadConfigAsync === undefined
		? adapter.loadConfig(context)
		: await adapter.loadConfigAsync(context);
}

function loadGeneratedMeta(
	files: readonly AdapterGeneratedFile[],
	directory: string,
): PandwindMeta {
	const temp = mkdtempSync(join(tmpdir(), "pandwind-codemod-meta-"));
	try {
		for (const file of files) {
			if (!/\/(?:types\.d\.ts|tw\.ts|bridge\.ts|pandwind\.interop\.json)$/u.test(`/${file.path}`))
				continue;
			const output = resolve(temp, file.path.slice(directory.length + 1));
			const parent = dirname(output);
			if (parent !== temp) {
				// The support directory is flat today; keeping this branch makes the
				// temporary loader safe if a target later nests generated modules.
				mkdirSync(parent, { recursive: true });
			}
			writeFileSync(output, file.content);
		}
		return loadMetaFromSources({
			typesDtsPath: join(temp, "types.d.ts"),
			twTsPath: join(temp, "tw.ts"),
			bridgePath: join(temp, "bridge.ts"),
			interopPath: join(temp, "pandwind.interop.json"),
		});
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

/** Build project-owned Pandwind modules from the source adapter's evidence. */
export async function createPandwindProjectSupport(
	request: ProjectBootstrapRequest,
): Promise<PandwindProjectSupport> {
	const sourceConfig = await loadSourceConfig(request);
	const directory = posixPath(request.outputDirectory).replace(/\/$/u, "");
	const preset = projectFile(directory, "preset.ts");
	const css = projectFile(directory, "css.ts");
	const runtimeCss = projectFile(directory, "runtime.ts");
	const dss = projectFile(directory, "dss.ts");
	const cx = projectFile(directory, "cx.ts");
	const configurationFailed = (sourceConfig.residuals?.length ?? 0) > 0;
	const files: AdapterGeneratedFile[] = configurationFailed
		? []
		: [
				generatedFile(preset, presetSource(sourceConfig, {}), "Pandwind target preset"),
				generatedFile(css, cssSource(), "shared extracted css() binding"),
				generatedFile(runtimeCss, runtimeCssSource(), "shared runtime css() binding"),
				generatedFile(dss, dssSource(), "shared design-system dss() binding"),
				generatedFile(cx, cxSource(), "shared cx() binding"),
			];

	const cssEntry = sourceConfig.files.find((file) => /\.css$/u.test(file));
	if (!configurationFailed && cssEntry !== undefined) {
		const stylesheet = request.readFile(cssEntry);
		if (stylesheet !== undefined) {
			const conditions = customVariantConditions(stylesheet);
			const presetFile = files.find((file) => file.path === preset)!;
			const withConditions = presetSource(sourceConfig, conditions);
			files[files.indexOf(presetFile)] = generatedFile(
				preset,
				withConditions,
				"Pandwind target preset",
			);
			const base = dirname(cssEntry);
			const generated = await generateDesignSystem(stylesheet, base);
			const bridge = await generateUtilityBridge(stylesheet, base, {
				props: BRIDGE_PROPS,
				values: scalarTokenValues(sourceConfig),
			});
			const types = projectFile(directory, "types.d.ts");
			const tw = projectFile(directory, "tw.ts");
			const bridgeFile = projectFile(directory, "bridge.ts");
			const theme = buildThemeBlock(sourceConfig.tokenCatalog?.groups ?? {});
			const interop = buildPandwindInteropArtifact({
				typesDts: generated.typesDts,
				twTs: generated.twTs,
				bridge,
				artifactDir: directory,
				...(theme === "" ? {} : { themeBlock: theme }),
			});
			files.push(
				generatedFile(types, generated.typesDts, "Tailwind-derived typed tw() metadata"),
				generatedFile(tw, generated.twTs, "Tailwind-derived tw() runtime"),
				generatedFile(
					bridgeFile,
					bridgeSource(bridge, generated.twTs, "./preset"),
					"Tailwind-derived css() utility bridge",
				),
				generatedFile(
					projectFile(directory, "pandwind.interop.json"),
					`${JSON.stringify(interop, null, "\t")}\n`,
					"versioned Pandwind interop artifact",
				),
			);
			if (theme !== "")
				files.push(
					generatedFile(projectFile(directory, "pandwind-theme.css"), theme, "derived theme block"),
				);
		}
	}

	const metaFiles = files.some(
		(file) => file.path === projectFile(directory, "pandwind.interop.json"),
	)
		? files
		: undefined;
	const hasGeneratedTw = files.some((file) => file.path === projectFile(directory, "tw.ts"));
	return {
		metaDirectory: directory,
		bindings: {
			...(configurationFailed
				? {}
				: { cssModule: css, runtimeCssModule: runtimeCss, dssModule: dss, cxModule: cx }),
			...(configurationFailed || !hasGeneratedTw
				? {}
				: { twModule: projectFile(directory, "tw.ts") }),
		},
		files,
		fileChanges: [
			...removeTailwindStylesheetImports(request, sourceConfig, directory),
			...rewriteTailwindViteConfigs(request, sourceConfig, directory),
		],
		...(metaFiles === undefined ? {} : { meta: loadGeneratedMeta(metaFiles, directory) }),
		sourceConfig,
	};
}
