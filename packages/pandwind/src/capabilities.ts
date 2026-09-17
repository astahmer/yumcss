/**
 * Internal capability vocabulary shared by the CSS-in-JS scorecard,
 * diagnostics, and future adapter reports.
 *
 * This is intentionally not exported from a public package entry point. It is
 * a contract for describing behavior, not another app-facing styling API.
 */
type CapabilityStatus = "static" | "runtime" | "partial" | "unsupported";

export interface CapabilityRecord {
	readonly feature: string;
	readonly status: CapabilityStatus;
	readonly detail: string;
}

export const CSS_IN_JS_CAPABILITIES = [
	{
		feature: "typed-general-css",
		status: "static",
		detail: "createCss(preset) is typed against ordinary CSS properties and preset conditions.",
	},
	{
		feature: "atomic-css",
		status: "static",
		detail: "Literal declarations become deterministic deduplicated atomic rules.",
	},
	{
		feature: "static-extraction",
		status: "static",
		detail: "Literal css calls can be extracted by the bundler plugin.",
	},
	{
		feature: "dynamic-values",
		status: "runtime",
		detail: "css.vars provides inline custom properties for values known only at runtime.",
	},
	{
		feature: "theme-scopes",
		status: "static",
		detail: "Theme and component token scopes are emitted as deterministic CSS blocks.",
	},
	{
		feature: "global-rules",
		status: "runtime",
		detail:
			"The DOM-optional runtime sheet registers deterministic global semantic rules; authored CSS imports remain observable through tooling.",
	},
	{
		feature: "keyframes",
		status: "partial",
		detail:
			"Literal css.keyframes({...}) bodies emit deterministic @keyframes rules at build time; non-literal bodies stay on the runtime call with an actionable diagnostic.",
	},
	{
		feature: "font-face",
		status: "runtime",
		detail:
			"The runtime sheet registers @font-face semantic rules with stable ordering; authored CSS imports remain observable through tooling.",
	},
	{
		feature: "layers-supports-property",
		status: "runtime",
		detail:
			"Cascade layers, supports blocks, and custom-property definitions share the semantic rule path.",
	},
	{
		feature: "ssr-hydration",
		status: "partial",
		detail:
			"css.vars() and runtime-sheet snapshots are serializable and hydratable; framework adapters remain host-owned.",
	},
	{
		feature: "bundler-integration",
		status: "static",
		detail:
			"Vite, unplugin, React/Preact host compiler seams, and a React server-streaming fixture are covered.",
	},
	{
		feature: "source-provenance",
		status: "static",
		detail:
			"Semantic migration and analyze/inspector payloads retain source ranges, editor links, and emitted rule identities.",
	},
	{
		feature: "recipes-and-hosts",
		status: "static",
		detail:
			"Recipes, slot recipes, renderer-neutral host adapters, and versioned framework-native compiler hooks exist.",
	},
] as const satisfies readonly CapabilityRecord[];
