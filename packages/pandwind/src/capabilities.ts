/**
 * Internal capability vocabulary shared by the CSS-in-JS scorecard,
 * diagnostics, and future adapter reports.
 *
 * This is intentionally not exported from a public package entry point. It is
 * a contract for describing behavior, not another app-facing styling API.
 */
export type CapabilityStatus = "static" | "runtime" | "partial" | "unsupported";

export interface CapabilityRecord {
	readonly feature: string;
	readonly status: CapabilityStatus;
	readonly detail: string;
}

export const CSS_IN_JS_CAPABILITIES = [
	{
		feature: "typed-general-css",
		status: "partial",
		detail: "The design vocabulary is typed; the general css lane needs a preset-bound contract.",
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
		status: "partial",
		detail: "Web projects use explicit authored CSS imports; no first-class TS global-rule primitive exists.",
	},
	{
		feature: "keyframes-font-face",
		status: "partial",
		detail: "Web projects use explicit authored CSS imports; no first-class TS animation/font primitive exists.",
	},
	{
		feature: "ssr-hydration",
		status: "partial",
		detail:
			"css.vars() is serializable and server-safe; browser hydration proves class/style stability, while runtime sheet extraction remains host-owned.",
	},
	{
		feature: "bundler-integration",
		status: "partial",
		detail: "Vite and unplugin adapters exist; framework-specific fixtures are still needed.",
	},
	{
		feature: "source-provenance",
		status: "partial",
		detail:
			"Analyze/inspector payloads carry source ranges and emitted rule identities when a matching preset is available.",
	},
] as const satisfies readonly CapabilityRecord[];
