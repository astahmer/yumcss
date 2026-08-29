/** Open host id; built-ins are named separately so third-party hosts do not edit this union. */
export enum BuiltinHostFramework {
	React = "react",
	Preact = "preact",
	Solid = "solid",
	Qwik = "qwik",
	Vue = "vue",
	Svelte = "svelte",
	Astro = "astro",
}
export type HostFramework = BuiltinHostFramework | (string & {});

export const HOST_FRAMEWORK_PLUGIN_SCHEMA = "pandwind.host-framework-plugin/1" as const;

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
		BuiltinHostFramework.React,
		[".jsx", ".tsx"],
		"className",
		true,
		true,
		["react"],
		(file, source) =>
			/from\s+["']react(?:\/jsx-runtime)?["']|jsx-runtime/.test(source) ||
			(/\.(?:jsx|tsx)$/.test(file) &&
				!/from\s+["'](?:preact|solid-js)["']|\bcreateSignal\s*\(/.test(source)),
	),
	preact: makeAdapter(
		BuiltinHostFramework.Preact,
		[".jsx", ".tsx"],
		"className",
		true,
		true,
		["preact"],
		(_file, source) => /from\s+["']preact(?:\/jsx-runtime)?["']/.test(source),
	),
	solid: makeAdapter(
		BuiltinHostFramework.Solid,
		[".jsx", ".tsx"],
		"class",
		true,
		true,
		["solid-js"],
		(_file, source) => /from\s+["']solid-js["']|\bcreateSignal\s*\(/.test(source),
	),
	qwik: makeAdapter(
		BuiltinHostFramework.Qwik,
		[".jsx", ".tsx"],
		"class",
		true,
		true,
		["@builder.io/qwik"],
		(_file, source) => /from\s+["']@builder\.io\/qwik(?:\/|["'])/.test(source),
	),
	vue: makeAdapter(
		BuiltinHostFramework.Vue,
		[".vue"],
		"class",
		true,
		true,
		["vue"],
		(file, source) => file.endsWith(".vue") || /from\s+["']vue["']/.test(source),
	),
	svelte: makeAdapter(
		BuiltinHostFramework.Svelte,
		[".svelte"],
		"class",
		true,
		true,
		["svelte"],
		(file, source) => file.endsWith(".svelte") || /from\s+["']svelte["']/.test(source),
	),
	astro: makeAdapter(BuiltinHostFramework.Astro, [".astro"], "class", true, true, ["astro"], (file) =>
		file.endsWith(".astro"),
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
