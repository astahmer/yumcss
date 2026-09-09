import { dirname, join, relative, resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { NodeKind } from "pandwind/tw/literal";
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
	/** Generated preset module relative to `outputDirectory`. */
	readonly presetFile?: string;
	/** Exported preset binding in the generated preset module. */
	readonly presetBinding?: string;
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

type ConfigAstNode = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

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
	let parsed: ConfigAstNode;
	try {
		parsed = SOURCE_SCANNER_SERVICE.parse({
			file,
			source,
			language: file.endsWith(".ts") ? "typescript" : "javascript",
		}).program as unknown as ConfigAstNode;
	} catch {
		return undefined;
	}
	const body = Array.isArray(parsed.body) ? (parsed.body as ConfigAstNode[]) : [];
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
	return resolve(initializers.get("config")) ??
		body
			.filter((statement) => statement.type === NodeKind.VariableDeclaration)
			.flatMap((statement) => (statement.declarations as ConfigAstNode[] | undefined) ?? [])
			.map((declaration) => resolve(declaration.init as ConfigAstNode | undefined))
			.find((config): config is ConfigAstNode => config !== undefined);
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
	if (source.includes("pandwindWebpackCss")) return source;
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
		const returnStatement = statements.find((statement) => statement.type === NodeKind.ReturnStatement);
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
	const presetFile = request.presetFile ?? "preset.mjs";
	const presetBinding = request.presetBinding ?? "pandwindPreset";
	const presetSpecifier = `./${relative(
		dirname(next.path),
		join(outputDirectory, presetFile),
	).replaceAll("\\", "/")}`;
	const normalizedPresetSpecifier = presetSpecifier.startsWith(".")
		? presetSpecifier
		: `./${presetSpecifier}`;
	const pluginImport = 'import { pandwindWebpackCss } from "pandwind/unplugin";';
	const presetImport = `import { ${presetBinding} } from "${normalizedPresetSpecifier}";`;
	const plugin = `pandwindWebpackCss({ preset: ${presetBinding}, root: process.cwd(), virtualId: "${PANDWIND_NEXT_CSS_ID}" })`;
	const webpackBody = `\t\tconfig.plugins.push(\n\t\t\t${plugin}\n\t\t);`;

	let config = next.source;
	if (next.generated) {
		config = generatedWebpackConfig(plugin, pluginImport, presetImport);
	} else {
		if (!config.includes("pandwindWebpackCss")) {
			const withWebpack = addWebpackPlugin(config, webpackBody, next.path);
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
