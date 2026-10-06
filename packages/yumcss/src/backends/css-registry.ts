import type { CssBackendOptions } from "./css.ts";
import { createCssBackend } from "./css.ts";
import { STYLE_BACKEND_SCHEMA, StyleBackendId, type BackendCapabilityContract } from "./types.ts";
import type { StyleBackendFactory } from "./registry.ts";

const CSS_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "yumcss.style-backend-capabilities/1",
	artifact: "stylesheet",
	unsupported: "throw",
	features: {
		declarations: "exact",
		conditions: "exact",
		"dynamic-values": "exact",
		"runtime-conditions": "unsupported",
		"unit-conversion": "exact",
		serialization: "exact",
		"stable-identity": "exact",
		ssr: "exact",
	},
};

export const CSS_BACKEND: StyleBackendFactory<CssBackendOptions, string> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: StyleBackendId.Css,
	capabilities: CSS_BACKEND_CAPABILITIES,
	create: createCssBackend,
};
