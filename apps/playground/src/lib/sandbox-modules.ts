import { createNamedAtomsStrategy } from "yumcss/css/named";
import { createRuntimeCss, createRuntimeDesignCss } from "yumcss/css/runtime";
import { createCx } from "yumcss/cx";
import { define } from "yumcss/preset";
import { csstypePreset } from "yumcss/preset/csstype";
import { defaultPreset } from "yumcss/preset/default";
import { examplePreset } from "@yumcss/example-preset";

// The playground runs both public CSS lanes through runtime sheets so example
// previews observe the same preset binding and class-name instrumentation.
const createPlaygroundCss = (
	preset: Parameters<typeof createRuntimeCss>[0],
	options: Parameters<typeof createRuntimeCss>[1] = {},
) => createRuntimeCss(preset, options);

const createPlaygroundUnsafeCss = (options: Parameters<typeof createRuntimeCss>[1] = {}) =>
	createRuntimeCss(examplePreset, options);

/**
 * Real yumcss subpath modules the sandbox resolves import statements
 * against, so generated examples can `import { createDesignCss } from
 * "yumcss/design"` exactly like a user project would.
 */
export const SANDBOX_MODULES = {
	"yumcss/css": { createCss: createPlaygroundCss },
	"yumcss/css/named": { createNamedAtomsStrategy },
	"yumcss/unsafe/css": { createUnsafeCss: createPlaygroundUnsafeCss },
	"yumcss/css/runtime": { createRuntimeCss, createRuntimeDesignCss },
	"yumcss/design": { createDesignCss: createRuntimeDesignCss },
	"yumcss/cx": { createCx },
	"yumcss/preset": {
		define,
	},
	"yumcss/preset/csstype": {
		csstypePreset,
	},
	"yumcss/preset/default": {
		defaultPreset,
	},
	"@yumcss/example-preset": {
		examplePreset,
		define,
	},
} as const;
