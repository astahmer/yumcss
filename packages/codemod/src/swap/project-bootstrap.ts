import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

function presetSource(
	config: AdapterProjectConfig,
	conditions: Readonly<Record<string, string>>,
): string {
	return `import { definePreset } from "pandwind/preset";

export const pandwindPreset = definePreset(
	{
		config: {},
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

function cxSource(): string {
	return `import { createCx } from "pandwind/cx";
import { css } from "./css";

export const cx = createCx({ css });
`;
}

function bridgeSource(
	bridge: UtilityBridge,
	twSource: string,
	presetImport: string,
): string {
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

function loadGeneratedMeta(files: readonly AdapterGeneratedFile[], directory: string): PandwindMeta {
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
	const cx = projectFile(directory, "cx.ts");
	const files: AdapterGeneratedFile[] = [
		generatedFile(preset, presetSource(sourceConfig, {}), "Pandwind target preset"),
		generatedFile(css, cssSource(), "shared extracted css() binding"),
		generatedFile(runtimeCss, runtimeCssSource(), "shared runtime css() binding"),
		generatedFile(cx, cxSource(), "shared cx() binding"),
	];

	const cssEntry = sourceConfig.files[0];
	if (cssEntry !== undefined) {
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
				files.push(generatedFile(projectFile(directory, "pandwind-theme.css"), theme, "derived theme block"));
		}
	}

	const metaFiles = files.some((file) => file.path === projectFile(directory, "pandwind.interop.json"))
		? files
		: undefined;
	return {
		metaDirectory: directory,
		bindings: {
			cssModule: css,
			runtimeCssModule: runtimeCss,
			cxModule: cx,
		},
		files,
		...(metaFiles === undefined ? {} : { meta: loadGeneratedMeta(metaFiles, directory) }),
		sourceConfig,
	};
}
