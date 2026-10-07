// Shared by the Starlight config and the Open Graph image generator.
export const sidebar = [
	{
		label: "Start here",
		items: ["start/why", "start/quick-start"],
	},
	{
		label: "Styling with css()",
		items: [
			"css/overview",
			"css/conditions",
			"css/dynamic-styles",
			"css/composition",
			"css/escape-hatches",
			"css/extraction",
		],
	},
	{
		label: "Design systems",
		items: [
			"design-system/presets",
			"design-system/themes",
			"design-system/built-in-presets",
			"design-system/design-css",
			"design-system/design-tokens",
		],
	},
	{
		label: "Component libraries",
		items: ["components/component-library"],
	},
	{
		label: "Coming from Tailwind",
		items: [
			"tailwind/overview",
			"tailwind/tw",
			"tailwind/tailwind-classes",
			"tailwind/migrating-class-strings",
		],
	},
	{
		label: "Migrating",
		items: ["migrate/overview"],
	},
	{
		label: "Tools",
		items: [
			"tools/playground",
			"tools/inspector",
			"tools/analyzer",
			"tools/migration-preview",
			"tools/devtools",
			"tools/lint",
			"tools/mcp",
		],
	},
	{
		label: "Guides",
		items: ["guides/bundlers", "guides/ssr", "guides/platforms"],
	},
	{
		label: "Reference",
		items: ["reference/api", "reference/vite", "reference/class-name-strategies", "reference/cli"],
	},
	{
		label: "Project internals",
		collapsed: true,
		items: [
			"contributing/limitations",
			"contributing/size",
			"contributing/benchmarks",
			"contributing/api-matrix",
			"contributing/adapter-contract",
			"contributing/implementation-status",
			"contributing/architecture",
			"contributing/testing",
		],
	},
];
