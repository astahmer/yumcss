import { dirname, join, relative, resolve } from "node:path";
import { SourcePass } from "../source-pass-utils.ts";
import { ensureImport } from "../shared.ts";

/** The file-like virtual id used by Next/Webpack, where URI schemes are rejected. */
export const PANDWIND_NEXT_CSS_ID = "pandwind-css.css" as const;

interface HostProjectFileSystem {
	read(path: string): string | undefined;
	exists(path: string): boolean;
}

export interface HostFileChange {
	readonly path: string;
	readonly content: string;
	readonly expectedContent?: string;
}

export interface PandwindNextIntegrationRequest {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly fileSystem: HostProjectFileSystem;
	readonly packageJson?: Readonly<Record<string, unknown>>;
}

export interface PandwindNextIntegrationPlan {
	readonly enabled: boolean;
	readonly configPath?: string;
	readonly fileChanges: readonly HostFileChange[];
	readonly notes: readonly string[];
}

const NEXT_CONFIG_NAMES = [
	"next.config.mjs",
	"next.config.js",
	"next.config.ts",
	"next.config.cjs",
] as const;

const packageSectionHas = (
	packageJson: Readonly<Record<string, unknown>> | undefined,
	section: string,
	name: string,
): boolean => {
	const values = packageJson?.[section];
	return (
		values !== null &&
		typeof values === "object" &&
		!Array.isArray(values) &&
		name in (values as Record<string, unknown>)
	);
};

function hasNextDependency(packageJson: Readonly<Record<string, unknown>> | undefined): boolean {
	return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some(
		(section) => packageSectionHas(packageJson, section, "next"),
	);
}

function findNextConfig(
	request: PandwindNextIntegrationRequest,
): { readonly path: string; readonly source: string; readonly generated: boolean } | undefined {
	const existing = NEXT_CONFIG_NAMES.map((name) => join(request.projectRoot, name)).find((path) =>
		request.fileSystem.exists(path),
	);
	if (existing !== undefined) {
		const source = request.fileSystem.read(existing);
		return source === undefined ? undefined : { path: existing, source, generated: false };
	}
	if (!hasNextDependency(request.packageJson)) return undefined;
	const path = join(request.projectRoot, "next.config.mjs");
	return { path, source: "", generated: true };
}

function generatedWebpackConfig(
	plugin: string,
	pluginImport: string,
	presetImport: string,
): string {
	return [
		pluginImport,
		presetImport,
		"",
		"const config = {",
		"\twebpack(config) {",
		"\t\tconfig.plugins.push(",
		`\t\t\t${plugin}`,
		"\t\t);",
		"\t\treturn config;",
		"\t},",
		"};",
		"",
		"export default config;",
		"",
	].join("\n");
}

function appendConfigProperty(source: string, property: string): string | undefined {
	const configDeclaration = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{/u.exec(source);
	const defaultObject = /export\s+default\s*\{/u.exec(source);
	const match = configDeclaration ?? defaultObject;
	if (match === null || match.index === undefined) return undefined;
	const open = source.indexOf("{", match.index);
	const block = SourcePass.matchBlock(source, open);
	if (block === null) return undefined;
	const close = block.end - 1;
	const prefix = source.slice(0, close).replace(/\s+$/u, "");
	const separator = prefix.endsWith(",") || prefix.endsWith("{") ? "\n" : ",\n";
	return `${prefix}${separator}${property}\n${source.slice(close)}`;
}

function addWebpackPlugin(source: string, webpackBody: string): string | undefined {
	const existingWebpack = /webpack\s*(?:\([^)]*\)|:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{/u;
	const match = existingWebpack.exec(source);
	if (match?.index !== undefined) {
		const open = source.indexOf("{", match.index);
		const block = SourcePass.matchBlock(source, open);
		if (block === null) return undefined;
		const body = block.body;
		if (body.includes("pandwindWebpackCss")) return source;
		const returnIndex = body.search(/\breturn\b/u);
		const insertion = returnIndex === -1 ? body.length : returnIndex;
		const before = body.slice(0, insertion).replace(/\s*$/u, "");
		const after = body.slice(insertion);
		const separator = before === "" || before.endsWith("\n") ? "" : "\n";
		const nextBody = `${before}${separator}${webpackBody}\n${after.replace(/^\s*/u, "")}`;
		return `${source.slice(0, open + 1)}${nextBody}${source.slice(block.end - 1)}`;
	}

	const property = `\twebpack(config) {\n${webpackBody}\n\t\treturn config;\n\t},`;
	return appendConfigProperty(source, property);
}

function layoutPaths(projectRoot: string, fileSystem: HostProjectFileSystem): readonly string[] {
	return [
		join(projectRoot, "app", "layout.tsx"),
		join(projectRoot, "app", "layout.ts"),
		join(projectRoot, "src", "app", "layout.tsx"),
		join(projectRoot, "src", "app", "layout.ts"),
	].filter((path) => fileSystem.exists(path));
}

/** Plan the host wiring required for a Pandwind static stylesheet in Next. */
export function planPandwindNextIntegration(
	request: PandwindNextIntegrationRequest,
): PandwindNextIntegrationPlan {
	const next = findNextConfig(request);
	if (next === undefined) return { enabled: false, fileChanges: [], notes: [] };

	const outputDirectory = resolve(request.projectRoot, request.outputDirectory);
	const presetSpecifier = `./${relative(
		dirname(next.path),
		join(outputDirectory, "preset.mjs"),
	).replaceAll("\\", "/")}`;
	const normalizedPresetSpecifier = presetSpecifier.startsWith(".")
		? presetSpecifier
		: `./${presetSpecifier}`;
	const pluginImport = 'import { pandwindWebpackCss } from "pandwind/unplugin";';
	const presetImport = `import { pandwindPreset } from "${normalizedPresetSpecifier}";`;
	const plugin = `pandwindWebpackCss({ preset: pandwindPreset, root: process.cwd(), virtualId: "${PANDWIND_NEXT_CSS_ID}" })`;
	const webpackBody = `\t\tconfig.plugins.push(\n\t\t\t${plugin}\n\t\t);`;

	let config = next.source;
	if (next.generated) {
		config = generatedWebpackConfig(plugin, pluginImport, presetImport);
	} else {
		if (!config.includes("pandwindWebpackCss")) {
			const withWebpack = addWebpackPlugin(config, webpackBody);
			if (withWebpack === undefined) {
				return {
					enabled: false,
					configPath: next.path,
					fileChanges: [],
					notes: [
						`could not safely add pandwindWebpackCss to ${relative(request.projectRoot, next.path)}`,
					],
				};
			}
			config = withWebpack;
		}
		config = ensureImport(config, pluginImport);
		config = ensureImport(config, presetImport);
	}

	const fileChanges: HostFileChange[] = [];
	if (config !== next.source) {
		fileChanges.push({
			path: next.path,
			content: config,
			...(next.generated ? {} : { expectedContent: next.source }),
		});
	}

	for (const layoutPath of layoutPaths(request.projectRoot, request.fileSystem)) {
		const layout = request.fileSystem.read(layoutPath);
		if (layout === undefined) continue;
		const nextLayout = ensureImport(
			layout
				.replaceAll('import "pandwind:css";\n', "")
				.replaceAll('import "pandwind:css";', "")
				.replaceAll(`import "${PANDWIND_NEXT_CSS_ID}";\n`, "")
				.replaceAll(`import "${PANDWIND_NEXT_CSS_ID}";`, ""),
			`import "${PANDWIND_NEXT_CSS_ID}";`,
		);
		if (nextLayout === layout) continue;
		fileChanges.push({
			path: layoutPath,
			content: nextLayout,
			expectedContent: layout,
		});
	}

	return {
		enabled: true,
		configPath: next.path,
		fileChanges,
		notes: [
			`registered pandwindWebpackCss in ${relative(request.projectRoot, next.path)}`,
			...fileChanges
				.filter((change) => change.path !== next.path)
				.map(
					(change) =>
						`imported ${PANDWIND_NEXT_CSS_ID} in ${relative(request.projectRoot, change.path)}`,
				),
		],
	};
}
