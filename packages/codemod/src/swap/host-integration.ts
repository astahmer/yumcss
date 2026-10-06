import { dirname, join, relative, resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind } from "yumcss/tw/literal";
import { ensureImport } from "../shared.ts";

/** The file-like virtual id used by Next/Webpack, where URI schemes are rejected. */
export const YUMCSS_NEXT_CSS_ID = "yumcss-css.css" as const;

interface HostProjectFileSystem {
	read(path: string): string | undefined;
	exists(path: string): boolean;
}

export interface HostFileChange {
	readonly path: string;
	readonly content: string;
	readonly expectedContent?: string;
}

export interface YumCSSViteIntegrationRequest {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly fileSystem: HostProjectFileSystem;
	readonly presetFile?: string;
	readonly presetBinding?: string;
}

export interface YumCSSViteIntegrationPlan {
	readonly enabled: boolean;
	readonly configPath?: string;
	readonly fileChanges: readonly HostFileChange[];
	readonly notes: readonly string[];
}

export interface YumCSSNextIntegrationRequest {
	readonly projectRoot: string;
	readonly outputDirectory: string;
	readonly fileSystem: HostProjectFileSystem;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	/** Generated preset module relative to `outputDirectory`. */
	readonly presetFile?: string;
	/** Exported preset binding in the generated preset module. */
	readonly presetBinding?: string;
}

export interface YumCSSNextIntegrationPlan {
	readonly enabled: boolean;
	readonly configPath?: string;
	readonly presetFile?: string;
	readonly fileChanges: readonly HostFileChange[];
	readonly notes: readonly string[];
}

const NEXT_CONFIG_NAMES = [
	"next.config.mjs",
	"next.config.js",
	"next.config.ts",
	"next.config.cjs",
] as const;

const VITE_CONFIG_NAMES = [
	"vite.config.ts",
	"vite.config.mts",
	"vite.config.js",
	"vite.config.mjs",
	"vite.config.cts",
	"vite.config.cjs",
] as const;

export const withTypeScriptExtensionImports = (source: string): string | undefined => {
	const existingOption = /("allowImportingTsExtensions"\s*:\s*)(true|false)/u.exec(source);
	if (existingOption?.[2] === "true") return undefined;
	if (existingOption?.index !== undefined) {
		return (
			source.slice(0, existingOption.index) +
			existingOption[1] +
			"true" +
			source.slice(existingOption.index + existingOption[0].length)
		);
	}
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const compilerOptions = /("compilerOptions"\s*:\s*\{)/u.exec(source);
	let content: string;
	if (compilerOptions !== null && compilerOptions.index !== undefined) {
		const lineStart = source.lastIndexOf("\n", compilerOptions.index) + 1;
		const linePrefix = source.slice(lineStart, compilerOptions.index);
		const indentation = /^\s*/u.exec(linePrefix)?.[0] ?? "";
		content =
			source.slice(0, compilerOptions.index + compilerOptions[0].length) +
			`${newline}${indentation}\t"allowImportingTsExtensions": true,` +
			source.slice(compilerOptions.index + compilerOptions[0].length);
	} else {
		const openingBrace = source.indexOf("{");
		if (openingBrace < 0) return undefined;
		content =
			source.slice(0, openingBrace + 1) +
			`${newline}\t"compilerOptions": {${newline}\t\t"allowImportingTsExtensions": true${newline}\t},` +
			source.slice(openingBrace + 1);
	}
	return content === source ? undefined : content;
};

export function rewriteYumCSSViteConfig(input: {
	readonly projectRoot: string;
	readonly configPath: string;
	readonly outputDirectory: string;
	readonly source: string;
	readonly presetFile?: string;
	readonly presetBinding?: string;
}): { readonly enabled: boolean; readonly content: string; readonly note?: string } {
	const presetBinding = input.presetBinding ?? "preset";
	const presetPath = resolve(
		input.projectRoot,
		input.outputDirectory,
		input.presetFile ?? "preset.ts",
	);
	const presetSpecifier = relative(dirname(input.configPath), presetPath).replaceAll("\\", "/");
	const moduleSpecifier = presetSpecifier.startsWith(".")
		? presetSpecifier
		: `./${presetSpecifier}`;
	const pluginImport = 'import { yumcssExtractVite } from "yumcss/vite";';
	const presetImport = `import { ${presetBinding} } from "${moduleSpecifier}";`;
	const pluginCall = `yumcssExtractVite(${presetBinding}, { root: "." })`;
	if (input.source.includes(pluginCall) && input.source.includes(presetImport))
		return { enabled: true, content: input.source };
	if (/\byumcssExtractVite\s*\(/u.test(input.source))
		return {
			enabled: false,
			content: input.source,
			note: `preserved existing yumcssExtractVite configuration in ${relative(input.projectRoot, input.configPath)} because its preset could not be verified`,
		};

	let content = input.source;
	const pluginArray = /\bplugins\s*:\s*\[/u.exec(content);
	if (pluginArray !== null && pluginArray.index !== undefined) {
		const insertion = pluginArray.index + pluginArray[0].length;
		const remaining = content.slice(insertion);
		const separator = /^\s*\]/u.test(remaining) ? "" : ", ";
		content = `${content.slice(0, insertion)}${pluginCall}${separator}${content.slice(insertion)}`;
	} else {
		if (/\bplugins\s*:/u.test(content))
			return {
				enabled: false,
				content: input.source,
				note: `could not safely register yumcssExtractVite in ${relative(input.projectRoot, input.configPath)}`,
			};
		const configObject = /(?:defineConfig\s*\(\s*|export\s+default\s*)\{/u.exec(content);
		if (configObject === null || configObject.index === undefined)
			return {
				enabled: false,
				content: input.source,
				note: `could not safely register yumcssExtractVite in ${relative(input.projectRoot, input.configPath)}`,
			};
		const insertion = configObject.index + configObject[0].length;
		content = `${content.slice(0, insertion)}plugins: [${pluginCall}], ${content.slice(insertion)}`;
	}
	content = ensureImport(content, pluginImport);
	content = ensureImport(content, presetImport);
	return { enabled: true, content };
}

export function planYumCSSViteIntegration(
	request: YumCSSViteIntegrationRequest,
): YumCSSViteIntegrationPlan {
	const configPath = VITE_CONFIG_NAMES.map((name) => join(request.projectRoot, name)).find((path) =>
		request.fileSystem.exists(path),
	);
	if (configPath === undefined)
		return {
			enabled: false,
			fileChanges: [],
			notes: ["no root Vite config found for YumCSS CSS extraction"],
		};
	const source = request.fileSystem.read(configPath);
	if (source === undefined)
		return {
			enabled: false,
			configPath,
			fileChanges: [],
			notes: [
				`could not read ${relative(request.projectRoot, configPath)} for YumCSS CSS extraction`,
			],
		};
	const rewrite = rewriteYumCSSViteConfig({
		projectRoot: request.projectRoot,
		configPath,
		outputDirectory: request.outputDirectory,
		source,
		...(request.presetFile === undefined ? {} : { presetFile: request.presetFile }),
		...(request.presetBinding === undefined ? {} : { presetBinding: request.presetBinding }),
	});
	if (!rewrite.enabled)
		return {
			enabled: false,
			configPath,
			fileChanges: [],
			notes: [rewrite.note ?? `could not safely register yumcssExtractVite in ${configPath}`],
		};
	const fileChanges =
		rewrite.content === source
			? []
			: [{ path: configPath, content: rewrite.content, expectedContent: source }];
	return {
		enabled: true,
		configPath,
		fileChanges,
		notes:
			fileChanges.length === 0
				? []
				: [`registered yumcssExtractVite in ${relative(request.projectRoot, configPath)}`],
	};
}

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
	request: YumCSSNextIntegrationRequest,
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

type ConfigAstNode = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

const isConfigAstNode = (value: unknown): value is ConfigAstNode =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	"type" in value &&
	typeof value.type === "string";

const nodeRange = (node: ConfigAstNode | undefined): { start: number; end: number } | undefined =>
	typeof node?.start === "number" && typeof node.end === "number"
		? { start: node.start, end: node.end }
		: undefined;

const unwrapConfigExpression = (node: ConfigAstNode | undefined): ConfigAstNode | undefined => {
	let current = node;
	while (
		current?.type === NodeKind.ParenthesizedExpression ||
		current?.type === NodeKind.TSAsExpression ||
		current?.type === NodeKind.TSSatisfiesExpression
	) {
		current = current.expression as ConfigAstNode | undefined;
	}
	return current;
};

const configPropertyName = (property: ConfigAstNode): string | undefined => {
	const key = property.key as ConfigAstNode | undefined;
	if (key?.type === NodeKind.Identifier && typeof key.name === "string") return key.name;
	if (key?.type === NodeKind.Literal && typeof key.value === "string") return key.value;
	return undefined;
};

/** Resolve a Next config object through top-level bindings without evaluating it. */
function findNextConfigObject(source: string, file: string): ConfigAstNode | undefined {
	let parsed: unknown;
	try {
		parsed = SOURCE_SCANNER_SERVICE.parse({
			file,
			source,
			language: file.endsWith(".ts") ? "typescript" : "javascript",
		}).program;
	} catch {
		return undefined;
	}
	if (!isConfigAstNode(parsed)) return undefined;
	const body = Array.isArray(parsed.body) ? parsed.body.filter(isConfigAstNode) : [];
	const initializers = new Map<string, ConfigAstNode>();
	for (const statement of body) {
		if (statement.type !== NodeKind.VariableDeclaration) continue;
		for (const declaration of (statement.declarations as ConfigAstNode[] | undefined) ?? []) {
			const id = declaration.id as ConfigAstNode | undefined;
			if (id?.type === NodeKind.Identifier && typeof id.name === "string") {
				const init = unwrapConfigExpression(declaration.init as ConfigAstNode | undefined);
				if (init !== undefined) initializers.set(id.name, init);
			}
		}
	}

	const resolve = (
		node: ConfigAstNode | undefined,
		visited: ReadonlySet<string> = new Set(),
	): ConfigAstNode | undefined => {
		const current = unwrapConfigExpression(node);
		if (current === undefined) return undefined;
		if (current.type === NodeKind.Identifier && typeof current.name === "string") {
			if (visited.has(current.name)) return undefined;
			return resolve(initializers.get(current.name), new Set(visited).add(current.name));
		}
		if (current.type === NodeKind.CallExpression) {
			const argumentsList = (current.arguments as ConfigAstNode[] | undefined) ?? [];
			return resolve(argumentsList[0]);
		}
		return current.type === NodeKind.ObjectExpression ? current : undefined;
	};

	for (const statement of body) {
		if (statement.type !== NodeKind.ExportDefaultDeclaration) continue;
		const config = resolve(statement.declaration as ConfigAstNode | undefined);
		if (config !== undefined) return config;
	}
	return (
		resolve(initializers.get("config")) ??
		body
			.filter((statement) => statement.type === NodeKind.VariableDeclaration)
			.flatMap((statement) => (statement.declarations as ConfigAstNode[] | undefined) ?? [])
			.map((declaration) => resolve(declaration.init as ConfigAstNode | undefined))
			.find((config): config is ConfigAstNode => config !== undefined)
	);
}

function appendConfigProperty(
	source: string,
	configObject: ConfigAstNode,
	property: string,
): string | undefined {
	const range = nodeRange(configObject);
	if (range === undefined) return undefined;
	const close = range.end - 1;
	const prefix = source.slice(0, close).replace(/\s+$/u, "");
	const separator = prefix.endsWith(",") || prefix.endsWith("{") ? "\n" : ",\n";
	return `${prefix}${separator}${property}\n${source.slice(close)}`;
}

function addWebpackPlugin(source: string, webpackBody: string, file: string): string | undefined {
	if (/\byumcssWebpackCss\s*\(/u.test(source)) return source;
	const configObject = findNextConfigObject(source, file);
	if (configObject === undefined) return undefined;
	const properties = (configObject.properties as ConfigAstNode[] | undefined) ?? [];
	const webpackProperty = properties.find((property) => configPropertyName(property) === "webpack");
	if (webpackProperty !== undefined) {
		const webpackValue = unwrapConfigExpression(webpackProperty.value as ConfigAstNode | undefined);
		const body = webpackValue?.body as ConfigAstNode | undefined;
		const bodyRange = nodeRange(body);
		if (
			(webpackValue?.type !== NodeKind.FunctionExpression &&
				webpackValue?.type !== NodeKind.ArrowFunctionExpression) ||
			body?.type !== NodeKind.BlockStatement ||
			bodyRange === undefined
		)
			return undefined;
		const statements = (body.body as ConfigAstNode[] | undefined) ?? [];
		const returnStatement = statements.find(
			(statement) => statement.type === NodeKind.ReturnStatement,
		);
		const insertion = returnStatement?.start ?? bodyRange.end - 1;
		const bodyStart = bodyRange.start + 1;
		const before = source.slice(bodyStart, insertion).replace(/\s*$/u, "");
		const after = source.slice(insertion).replace(/^\s*/u, "");
		const separator = before === "" || before.endsWith("\n") ? "" : "\n";
		const nextBody = `${before}${separator}${webpackBody}\n${after}`;
		return `${source.slice(0, bodyStart)}${nextBody}${source.slice(bodyRange.end - 1)}`;
	}

	const property = `\twebpack(config) {\n${webpackBody}\n\t\treturn config;\n\t},`;
	return appendConfigProperty(source, configObject, property);
}

const existingNextPresetFile = (
	source: string,
	configPath: string,
	outputDirectory: string,
	projectRoot: string,
	presetBinding: string,
): string | undefined => {
	const importedFile = ["preset.ts", "preset.mjs"].find((file) => {
		const specifier = `./${relative(
			dirname(configPath),
			join(resolve(projectRoot, outputDirectory), file),
		).replaceAll("\\", "/")}`;
		return (
			source.includes(`import { ${presetBinding} } from "${specifier}"`) ||
			source.includes(`import { ${presetBinding} } from '${specifier}'`)
		);
	});
	if (importedFile === undefined) return undefined;
	const callStart = source.indexOf("yumcssWebpackCss(");
	const callEnd = source.indexOf("})", callStart);
	if (callStart < 0 || callEnd < 0) return undefined;
	const options = source.slice(callStart, callEnd);
	const optionBindings = new Set(
		[...options.matchAll(/(?:preset\s*:\s*|[,{]\s*)([A-Za-z_$][\w$]*)/gu)].map((match) => match[1]),
	);
	if (!optionBindings.has(presetBinding)) return undefined;
	const virtualId = /\bvirtualId\s*:\s*["']([^"']+)["']/u.exec(options)?.[1];
	if (virtualId !== YUMCSS_NEXT_CSS_ID) return undefined;
	if (!source.includes('import { yumcssWebpackCss } from "yumcss/unplugin";')) return undefined;
	return importedFile;
};

function layoutPaths(projectRoot: string, fileSystem: HostProjectFileSystem): readonly string[] {
	return [
		join(projectRoot, "app", "layout.tsx"),
		join(projectRoot, "app", "layout.ts"),
		join(projectRoot, "src", "app", "layout.tsx"),
		join(projectRoot, "src", "app", "layout.ts"),
	].filter((path) => fileSystem.exists(path));
}

/** Plan the host wiring required for a YumCSS static stylesheet in Next. */
export function planYumCSSNextIntegration(
	request: YumCSSNextIntegrationRequest,
): YumCSSNextIntegrationPlan {
	const next = findNextConfig(request);
	if (next === undefined) return { enabled: false, fileChanges: [], notes: [] };

	const outputDirectory = resolve(request.projectRoot, request.outputDirectory);
	const presetFile = request.presetFile ?? "preset.mjs";
	const presetBinding = request.presetBinding ?? "preset";
	const presetSpecifier = `./${relative(
		dirname(next.path),
		join(outputDirectory, presetFile),
	).replaceAll("\\", "/")}`;
	const normalizedPresetSpecifier = presetSpecifier.startsWith(".")
		? presetSpecifier
		: `./${presetSpecifier}`;
	const pluginImport = 'import { yumcssWebpackCss } from "yumcss/unplugin";';
	const presetImport = `import { ${presetBinding} } from "${normalizedPresetSpecifier}";`;
	const plugin = `yumcssWebpackCss({ preset: ${presetBinding}, root: process.cwd(), virtualId: "${YUMCSS_NEXT_CSS_ID}" })`;
	const webpackBody = `\t\tconfig.plugins.push(\n\t\t\t${plugin}\n\t\t);`;

	let config = next.source;
	let generatedPresetFile: string | undefined;
	if (next.generated) {
		config = generatedWebpackConfig(plugin, pluginImport, presetImport);
		generatedPresetFile = presetFile;
	} else {
		if (/\byumcssWebpackCss\s*\(/u.test(config)) {
			generatedPresetFile = existingNextPresetFile(
				config,
				next.path,
				request.outputDirectory,
				request.projectRoot,
				presetBinding,
			);
			if (generatedPresetFile === undefined)
				return {
					enabled: false,
					configPath: next.path,
					fileChanges: [],
					notes: [
						`preserved existing yumcssWebpackCss configuration in ${relative(request.projectRoot, next.path)} because its preset could not be verified`,
					],
				};
		} else {
			const withWebpack = addWebpackPlugin(config, webpackBody, next.path);
			if (withWebpack === undefined) {
				return {
					enabled: false,
					configPath: next.path,
					fileChanges: [],
					notes: [
						`could not safely add yumcssWebpackCss to ${relative(request.projectRoot, next.path)}`,
					],
				};
			}
			config = withWebpack;
			config = ensureImport(config, pluginImport);
			config = ensureImport(config, presetImport);
			generatedPresetFile = presetFile;
		}
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
				.replaceAll('import "yumcss:css";\n', "")
				.replaceAll('import "yumcss:css";', "")
				.replaceAll(`import "${YUMCSS_NEXT_CSS_ID}";\n`, "")
				.replaceAll(`import "${YUMCSS_NEXT_CSS_ID}";`, ""),
			`import "${YUMCSS_NEXT_CSS_ID}";`,
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
		...(generatedPresetFile === undefined ? {} : { presetFile: generatedPresetFile }),
		fileChanges,
		notes: [
			`registered yumcssWebpackCss in ${relative(request.projectRoot, next.path)}`,
			...fileChanges
				.filter((change) => change.path !== next.path)
				.map(
					(change) =>
						`imported ${YUMCSS_NEXT_CSS_ID} in ${relative(request.projectRoot, change.path)}`,
				),
		],
	};
}
