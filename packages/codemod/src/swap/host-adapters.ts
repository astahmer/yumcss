export type HostFramework = "react" | "preact" | "solid" | "vue" | "svelte" | "astro";

export interface HostFrameworkAdapter {
	readonly id: HostFramework;
	readonly classAttribute: "className" | "class";
	readonly styleAttribute: "style";
	readonly supportsClassList: boolean;
	readonly supportsStyleObject: boolean;
	readonly packageHints: readonly string[];
	/** Render a generated class expression in the framework's attribute syntax. */
	classBinding(expression: string): string;
	/** Merge a generated class expression with an existing static class. */
	mergeClass(existing: string | undefined, generated: string): string;
}

const classBinding = (attribute: "className" | "class", expression: string): string =>
	`${attribute}={${expression}}`;

const makeAdapter = (
	id: HostFramework,
	classAttribute: HostFrameworkAdapter["classAttribute"],
	supportsClassList: boolean,
	supportsStyleObject: boolean,
	packageHints: readonly string[],
): HostFrameworkAdapter => ({
	id,
	classAttribute,
	styleAttribute: "style",
	supportsClassList,
	supportsStyleObject,
	packageHints,
	classBinding: (expression) => classBinding(classAttribute, expression),
	mergeClass: (existing, generated) => {
		if (existing === undefined || existing.trim() === "")
			return classBinding(classAttribute, generated);
		return classBinding(classAttribute, `cx(${JSON.stringify(existing)}, ${generated})`);
	},
});

export const HOST_FRAMEWORK_ADAPTERS: Readonly<Record<HostFramework, HostFrameworkAdapter>> = {
	react: makeAdapter("react", "className", true, true, ["react"]),
	preact: makeAdapter("preact", "className", true, true, ["preact"]),
	solid: makeAdapter("solid", "class", true, true, ["solid-js"]),
	vue: makeAdapter("vue", "class", true, true, ["vue"]),
	svelte: makeAdapter("svelte", "class", true, true, ["svelte"]),
	astro: makeAdapter("astro", "class", true, true, ["astro"]),
};

export function getHostFrameworkAdapter(id: string): HostFrameworkAdapter | undefined {
	return HOST_FRAMEWORK_ADAPTERS[id as HostFramework];
}

export function detectHostFramework(
	source: string,
	file: string,
): HostFrameworkAdapter | undefined {
	if (file.endsWith(".vue") || /from\s+["']vue["']/.test(source))
		return HOST_FRAMEWORK_ADAPTERS.vue;
	if (file.endsWith(".svelte") || /from\s+["']svelte["']/.test(source))
		return HOST_FRAMEWORK_ADAPTERS.svelte;
	if (file.endsWith(".astro")) return HOST_FRAMEWORK_ADAPTERS.astro;
	if (/from\s+["']solid-js["']|\bcreateSignal\s*\(/.test(source))
		return HOST_FRAMEWORK_ADAPTERS.solid;
	if (/from\s+["']preact["']/.test(source)) return HOST_FRAMEWORK_ADAPTERS.preact;
	if (/from\s+["']react["']|jsx-runtime/.test(source) || /\.tsx?$/.test(file))
		return HOST_FRAMEWORK_ADAPTERS.react;
	return undefined;
}
