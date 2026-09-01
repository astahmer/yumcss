import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import type { StyleProgramResidual } from "./semantic-ir.ts";

/** Open host id; built-ins are named separately so third-party hosts do not edit this union. */
export enum BuiltinHostFramework {
	React = "react",
	Preact = "preact",
	Solid = "solid",
	Qwik = "qwik",
	Vue = "vue",
	Svelte = "svelte",
	Astro = "astro",
	ReactNative = "react-native",
}
export type HostFramework = BuiltinHostFramework | (string & {});

export interface HostDialectRewriteResult {
	readonly code: string;
	readonly residuals: readonly StyleProgramResidual[];
	readonly outputExtension?: string;
}

const vueDialectResidual = (text: string, hint: string): StyleProgramResidual => ({
	kind: "host-framework",
	text,
	hint,
});

function staticVueSfcParts(
	source: string,
): { readonly script: string; readonly template: string } | undefined {
	const scriptMatch = /<script\b[^>]*>([\s\S]*?)<\/script>/iu.exec(source);
	const templateMatch = /<template\b[^>]*>([\s\S]*?)<\/template>/iu.exec(source);
	if (scriptMatch === null || templateMatch === null) return undefined;
	const blockNames = source.match(/<(?:script|template)\b/giu) ?? [];
	if (blockNames.length !== 2) return undefined;
	const templateEnd = templateMatch.index + templateMatch[0].length;
	if (source.slice(templateEnd).trim() !== "") return undefined;
	return { script: scriptMatch[1]!, template: templateMatch[1]! };
}

/**
 * Conservative Vue SFC projection for static templates. It intentionally
 * rejects directives and reactive setup code; those need a framework-owned
 * semantic transform rather than a text substitution.
 */
export function canConvertStaticVueSfc(file: string, source: string): boolean {
	if (!/\.vue$/u.test(file)) return false;
	const parts = staticVueSfcParts(source);
	if (parts === undefined || parts.script.trim() === "" || parts.template.trim() === "")
		return false;
	return !(
		/\b(?:ref|reactive|computed|watch|watchEffect|onMounted|defineProps|defineEmits)\s*\(/u.test(
			parts.script,
		) || /\bv-[\w-]+\s*=|\s[@:#][\w-]+\s*=|\{\{[\s\S]*?\}\}|<slot\b/iu.test(parts.template)
	);
}

export function rewriteVueSfcToJsx(
	code: string,
	targetFramework: HostFramework,
): HostDialectRewriteResult {
	const parts = staticVueSfcParts(code);
	if (parts === undefined || !canConvertStaticVueSfc("App.vue", code))
		return {
			code,
			residuals: [
				vueDialectResidual(
					code,
					"Vue-to-host projection requires a static script setup and template without directives or reactive setup",
				),
			],
		};
	const script = parts.script.trim();
	let template = parts.template.trim();
	if (targetFramework === BuiltinHostFramework.React)
		template = template.replace(/\bclass\s*=/gu, "className=");
	return {
		code: `${script}\n\nexport default function App() {\n\treturn (\n${template}\n\t);\n}\n`,
		residuals: [],
		outputExtension: ".tsx",
	};
}

export const HOST_FRAMEWORK_PLUGIN_SCHEMA = "pandwind.host-framework-plugin/1" as const;
export const HOST_FRAMEWORK_CONTRACT_SCHEMA = "pandwind.host-framework-contract/1" as const;

export interface HostFrameworkAdapter {
	readonly id: HostFramework;
	readonly extensions: readonly string[];
	readonly syntax: "jsx" | "template";
	readonly classAttribute: "className" | "class";
	readonly styleAttribute: "style";
	readonly supportsClassList: boolean;
	readonly supportsStyleObject: boolean;
	readonly packageHints: readonly string[];
	detect(file: string, source: string): boolean;
	/** Render a generated class expression in the framework's attribute syntax. */
	classBinding(expression: string): string;
	/** Merge a generated class expression with an existing static class. */
	mergeClass(existing: string | undefined, generated: string): string;
}

export interface HostFrameworkPlugin {
	readonly schema: typeof HOST_FRAMEWORK_PLUGIN_SCHEMA;
	readonly id: HostFramework;
	readonly adapter: HostFrameworkAdapter;
}

const classBinding = (attribute: "className" | "class", expression: string): string =>
	`${attribute}={${expression}}`;

const makeAdapter = (
	id: HostFramework,
	extensions: readonly string[],
	classAttribute: HostFrameworkAdapter["classAttribute"],
	supportsClassList: boolean,
	supportsStyleObject: boolean,
	packageHints: readonly string[],
	detect: (file: string, source: string) => boolean,
): HostFrameworkAdapter => ({
	id,
	extensions,
	classAttribute,
	syntax: extensions.some((extension) => [".vue", ".svelte", ".astro"].includes(extension))
		? "template"
		: "jsx",
	styleAttribute: "style",
	supportsClassList,
	supportsStyleObject,
	packageHints,
	detect,
	classBinding: (expression) => classBinding(classAttribute, expression),
	mergeClass: (existing, generated) => {
		if (existing === undefined || existing.trim() === "")
			return classBinding(classAttribute, generated);
		return classBinding(classAttribute, `cx(${JSON.stringify(existing)}, ${generated})`);
	},
});

export interface HostFrameworkRegistry {
	readonly plugins: readonly HostFrameworkPlugin[];
	readonly adapters: readonly HostFrameworkAdapter[];
	register(adapter: HostFrameworkAdapter): HostFrameworkRegistry;
	registerPlugin(plugin: HostFrameworkPlugin): HostFrameworkRegistry;
	get(id: string): HostFrameworkAdapter | undefined;
	detect(file: string, source: string): HostFrameworkAdapter | undefined;
}

export interface HostFrameworkContractFixture {
	readonly adapter: HostFramework;
	readonly file: string;
	readonly source: string;
}

export interface HostFrameworkContractFailure {
	readonly adapter: HostFramework;
	readonly phase: "registration" | "detection" | "binding";
	readonly message: string;
}

export interface HostFrameworkContractResult {
	readonly schema: typeof HOST_FRAMEWORK_CONTRACT_SCHEMA;
	readonly valid: boolean;
	readonly checked: readonly HostFramework[];
	readonly failures: readonly HostFrameworkContractFailure[];
}

export interface HostFrameworkContractSuite {
	run(
		registry: HostFrameworkRegistry,
		fixtures: readonly HostFrameworkContractFixture[],
	): HostFrameworkContractResult;
}

export function createHostFrameworkRegistry(
	initial: readonly HostFrameworkAdapter[] = [],
): HostFrameworkRegistry {
	const adapters = new Map<string, HostFrameworkAdapter>();
	const plugins = new Map<string, HostFrameworkPlugin>();
	const registry: HostFrameworkRegistry = {
		get plugins() {
			return [...plugins.values()];
		},
		get adapters() {
			return [...adapters.values()];
		},
		register(adapter) {
			if (adapters.has(adapter.id))
				throw new Error(`host framework already registered: ${adapter.id}`);
			adapters.set(adapter.id, adapter);
			return registry;
		},
		registerPlugin(plugin) {
			if (plugin.schema !== HOST_FRAMEWORK_PLUGIN_SCHEMA)
				throw new Error(`unsupported host framework plugin schema: ${plugin.schema}`);
			plugins.set(plugin.id, plugin);
			return registry.register(plugin.adapter);
		},
		get: (id) => adapters.get(id),
		detect: (file, source) => registry.adapters.find((adapter) => adapter.detect(file, source)),
	};
	for (const adapter of initial) registry.register(adapter);
	return registry;
}

const builtin = {
	react: makeAdapter(
		"react",
		[".jsx", ".tsx"],
		"className",
		true,
		true,
		["react"],
		(file, source) =>
			/from\s+["']react(?:\/jsx-runtime)?["']|jsx-runtime/.test(source) ||
			(/\.(?:jsx|tsx)$/.test(file) &&
				!/from\s+["'](?:preact|solid-js|solid-styled-components|react-native)["']|\bcreateSignal\s*\(/.test(
					source,
				)),
	),
	[BuiltinHostFramework.ReactNative]: makeAdapter(
		BuiltinHostFramework.ReactNative,
		[".jsx", ".tsx"],
		"className",
		false,
		true,
		["react-native"],
		(_file, source) => /from\s+["']react-native["']/.test(source),
	),
	preact: makeAdapter(
		"preact",
		[".jsx", ".tsx"],
		"className",
		true,
		true,
		["preact"],
		(_file, source) => /from\s+["']preact(?:\/jsx-runtime)?["']/.test(source),
	),
	solid: makeAdapter(
		"solid",
		[".jsx", ".tsx"],
		"class",
		true,
		true,
		["solid-js"],
		(_file, source) =>
			/from\s+["'](?:solid-js|solid-styled-components)["']|\bcreateSignal\s*\(/.test(source),
	),
	qwik: makeAdapter(
		"qwik",
		[".jsx", ".tsx"],
		"class",
		true,
		true,
		["@builder.io/qwik"],
		(_file, source) => /from\s+["']@builder\.io\/qwik(?:\/|["'])/.test(source),
	),
	vue: makeAdapter(
		"vue",
		[".vue"],
		"class",
		true,
		true,
		["vue"],
		(file, source) =>
			SOURCE_SCANNER_SERVICE.languageForFile(file) === "vue" || /from\s+["']vue["']/.test(source),
	),
	svelte: makeAdapter(
		"svelte",
		[".svelte"],
		"class",
		true,
		true,
		["svelte"],
		(file, source) =>
			SOURCE_SCANNER_SERVICE.languageForFile(file) === "svelte" ||
			/from\s+["']svelte["']/.test(source),
	),
	astro: makeAdapter(
		"astro",
		[".astro"],
		"class",
		true,
		true,
		["astro"],
		(file) => SOURCE_SCANNER_SERVICE.languageForFile(file) === "astro",
	),
} satisfies Record<BuiltinHostFramework, HostFrameworkAdapter>;

export const HOST_FRAMEWORK_PLUGINS: readonly HostFrameworkPlugin[] = Object.values(builtin).map(
	(adapter) => ({
		schema: HOST_FRAMEWORK_PLUGIN_SCHEMA,
		id: adapter.id,
		adapter,
	}),
);

export const HOST_FRAMEWORK_REGISTRY = HOST_FRAMEWORK_PLUGINS.reduce(
	(registry, plugin) => registry.registerPlugin(plugin),
	createHostFrameworkRegistry(),
);

/** Compatibility projection; new code should depend on HOST_FRAMEWORK_REGISTRY. */
export const HOST_FRAMEWORK_ADAPTERS: Readonly<Record<BuiltinHostFramework, HostFrameworkAdapter>> =
	Object.fromEntries(
		HOST_FRAMEWORK_REGISTRY.adapters.map((adapter) => [adapter.id, adapter]),
	) as Readonly<Record<BuiltinHostFramework, HostFrameworkAdapter>>;

export function getHostFrameworkAdapter(id: string): HostFrameworkAdapter | undefined {
	return HOST_FRAMEWORK_REGISTRY.get(id);
}

export function detectHostFramework(
	source: string,
	file: string,
): HostFrameworkAdapter | undefined {
	return HOST_FRAMEWORK_REGISTRY.detect(file, source);
}

/** Prove host adapters can be substituted without host-specific orchestration. */
export function createHostFrameworkContractSuite(): HostFrameworkContractSuite {
	return {
		run(registry, fixtures) {
			const fixtureById = new Map(fixtures.map((fixture) => [fixture.adapter, fixture]));
			const checked: HostFramework[] = [];
			const failures: HostFrameworkContractFailure[] = [];
			for (const adapter of registry.adapters) {
				checked.push(adapter.id);
				const fixture = fixtureById.get(adapter.id);
				if (fixture === undefined) {
					failures.push({
						adapter: adapter.id,
						phase: "registration",
						message: "host adapter has no conformance fixture",
					});
					continue;
				}
				if (!adapter.detect(fixture.file, fixture.source)) {
					failures.push({
						adapter: adapter.id,
						phase: "detection",
						message: `host adapter did not detect ${fixture.file}`,
					});
					continue;
				}
				const binding = adapter.classBinding("generated");
				const merged = adapter.mergeClass("existing", "generated");
				if (
					!binding.includes("generated") ||
					!merged.includes("existing") ||
					!merged.includes("generated")
				)
					failures.push({
						adapter: adapter.id,
						phase: "binding",
						message: "host adapter did not preserve generated and existing class values",
					});
			}
			for (const fixture of fixtures)
				if (registry.adapters.every((adapter) => adapter.id !== fixture.adapter))
					failures.push({
						adapter: fixture.adapter,
						phase: "registration",
						message: "fixture targets an unregistered host adapter",
					});
			return {
				schema: HOST_FRAMEWORK_CONTRACT_SCHEMA,
				valid: failures.length === 0,
				checked,
				failures,
			};
		},
	};
}
