export type HostFramework = "react" | "preact" | "solid" | "vue" | "svelte" | "astro";

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

function makeAdapter(
	id: HostFramework,
	classProp: HostStyleAdapter["classProp"],
	packageHints: readonly string[],
): HostStyleAdapter {
	return {
		id,
		classProp,
		styleProp: "style",
		supportsStyleObject: true,
		packageHints,
		classProps: (className, existing) => ({
			[classProp]:
				existing === undefined || existing === "" ? className : `${existing} ${className}`,
		}),
		styleProps: (style) => ({ style }),
	};
}

export const HOST_STYLE_ADAPTERS: Readonly<Record<HostFramework, HostStyleAdapter>> = {
	react: makeAdapter("react", "className", ["react"]),
	preact: makeAdapter("preact", "className", ["preact"]),
	solid: makeAdapter("solid", "class", ["solid-js"]),
	vue: makeAdapter("vue", "class", ["vue"]),
	svelte: makeAdapter("svelte", "class", ["svelte"]),
	astro: makeAdapter("astro", "class", ["astro"]),
};

export function getHostStyleAdapter(id: string): HostStyleAdapter | undefined {
	return HOST_STYLE_ADAPTERS[id as HostFramework];
}
