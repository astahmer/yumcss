export const HOST_STYLE_PLUGIN_SCHEMA = "pandwind.host-style-plugin/1" as const;

export type HostFramework = string;
export type BuiltinHostFramework = "react" | "preact" | "solid" | "vue" | "svelte" | "astro";

export interface HostStyleAdapter {
	readonly id: HostFramework;
	readonly classProp: "className" | "class";
	readonly styleProp: "style";
	readonly supportsStyleObject: boolean;
	readonly packageHints: readonly string[];
	classProps(className: string, existing?: string): Readonly<Record<string, string>>;
	styleProps(
		style: Readonly<Record<string, unknown>>,
	): Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface HostStylePlugin {
	readonly schema: typeof HOST_STYLE_PLUGIN_SCHEMA;
	readonly id: HostFramework;
	readonly adapter: HostStyleAdapter;
}

export interface HostStyleRegistry {
	readonly plugins: readonly HostStylePlugin[];
	readonly adapters: readonly HostStyleAdapter[];
	register(plugin: HostStylePlugin): HostStyleRegistry;
	get(id: string): HostStyleAdapter | undefined;
}

const makePlugin = (
	id: HostFramework,
	classProp: HostStyleAdapter["classProp"],
	packageHints: readonly string[],
): HostStylePlugin => {
	const adapter: HostStyleAdapter = {
		id,
		classProp,
		styleProp: "style",
		supportsStyleObject: true,
		packageHints,
		classProps: (className, existing) => ({
			[classProp]: existing === undefined ? className : `${existing} ${className}`,
		}),
		styleProps: (style) => ({ style }),
	};
	return { schema: HOST_STYLE_PLUGIN_SCHEMA, id, adapter };
};

export function createHostStyleRegistry(
	initial: readonly HostStylePlugin[] = [],
): HostStyleRegistry {
	const plugins = new Map<string, HostStylePlugin>();
	const registry: HostStyleRegistry = {
		get plugins() {
			return [...plugins.values()];
		},
		get adapters() {
			return registry.plugins.map((plugin) => plugin.adapter);
		},
		register(plugin) {
			if (plugin.schema !== HOST_STYLE_PLUGIN_SCHEMA)
				throw new Error(`unsupported host style plugin schema: ${plugin.schema}`);
			if (plugins.has(plugin.id))
				throw new Error(`host style plugin already registered: ${plugin.id}`);
			plugins.set(plugin.id, plugin);
			return registry;
		},
		get: (id) => plugins.get(id)?.adapter,
	};
	for (const plugin of initial) registry.register(plugin);
	return registry;
}

export const BUILTIN_HOST_STYLE_PLUGINS: readonly HostStylePlugin[] = [
	makePlugin("react", "className", ["react", "react-dom"]),
	makePlugin("preact", "className", ["preact"]),
	makePlugin("solid", "class", ["solid-js"]),
	makePlugin("vue", "class", ["vue"]),
	makePlugin("svelte", "class", ["svelte"]),
	makePlugin("astro", "class", ["astro"]),
];

export const HOST_STYLE_REGISTRY = createHostStyleRegistry(BUILTIN_HOST_STYLE_PLUGINS);

/** Compatibility projection; composition-aware code should use the registry. */
export const HOST_STYLE_ADAPTERS: Readonly<Record<BuiltinHostFramework, HostStyleAdapter>> =
	Object.fromEntries(
		HOST_STYLE_REGISTRY.adapters.map((adapter) => [adapter.id, adapter]),
	) as Readonly<Record<BuiltinHostFramework, HostStyleAdapter>>;

export function getHostStyleAdapter(id: string): HostStyleAdapter | undefined {
	return HOST_STYLE_REGISTRY.get(id);
}
