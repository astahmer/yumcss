/** Open host id; built-ins are named separately so third-party hosts do not edit this union. */
export type HostFramework = string;
export type BuiltinHostFramework = "react" | "preact" | "solid" | "vue" | "svelte" | "astro";

export interface HostFrameworkAdapter {
	readonly id: HostFramework;
	readonly extensions: readonly string[];
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
	readonly adapters: readonly HostFrameworkAdapter[];
	register(adapter: HostFrameworkAdapter): HostFrameworkRegistry;
	get(id: string): HostFrameworkAdapter | undefined;
	detect(file: string, source: string): HostFrameworkAdapter | undefined;
}

export function createHostFrameworkRegistry(
	initial: readonly HostFrameworkAdapter[] = [],
): HostFrameworkRegistry {
	const adapters = new Map<string, HostFrameworkAdapter>();
	const registry: HostFrameworkRegistry = {
		get adapters() {
			return [...adapters.values()];
		},
		register(adapter) {
			if (adapters.has(adapter.id))
				throw new Error(`host framework already registered: ${adapter.id}`);
			adapters.set(adapter.id, adapter);
			return registry;
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
				!/from\s+["'](?:preact|solid-js)["']|\bcreateSignal\s*\(/.test(source)),
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
		(_file, source) => /from\s+["']solid-js["']|\bcreateSignal\s*\(/.test(source),
	),
	vue: makeAdapter(
		"vue",
		[".vue"],
		"class",
		true,
		true,
		["vue"],
		(file, source) => file.endsWith(".vue") || /from\s+["']vue["']/.test(source),
	),
	svelte: makeAdapter(
		"svelte",
		[".svelte"],
		"class",
		true,
		true,
		["svelte"],
		(file, source) => file.endsWith(".svelte") || /from\s+["']svelte["']/.test(source),
	),
	astro: makeAdapter("astro", [".astro"], "class", true, true, ["astro"], (file) =>
		file.endsWith(".astro"),
	),
} satisfies Record<BuiltinHostFramework, HostFrameworkAdapter>;

export const HOST_FRAMEWORK_REGISTRY = createHostFrameworkRegistry(Object.values(builtin));

/** Compatibility projection; new code should depend on HOST_FRAMEWORK_REGISTRY. */
export const HOST_FRAMEWORK_ADAPTERS: Readonly<Record<BuiltinHostFramework, HostFrameworkAdapter>> =
	builtin;

export function getHostFrameworkAdapter(id: string): HostFrameworkAdapter | undefined {
	return HOST_FRAMEWORK_REGISTRY.get(id);
}

export function detectHostFramework(
	source: string,
	file: string,
): HostFrameworkAdapter | undefined {
	return HOST_FRAMEWORK_REGISTRY.detect(file, source);
}
