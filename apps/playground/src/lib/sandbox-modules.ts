import { createNamedAtomsStrategy } from "pandwind/css";
import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import { createCx } from "pandwind/cx";
import { define } from "pandwind/preset";
import { basePreset } from "pandwind/preset/base";
import { defaultPreset } from "pandwind/preset/default";
import { examplePreset } from "@pandwind/example-preset";

// The playground runs both public CSS lanes through runtime sheets so example
// previews observe the same preset binding and class-name instrumentation.
const createPlaygroundCss = (
	preset: Parameters<typeof createRuntimeCss>[0],
	options: Parameters<typeof createRuntimeCss>[1] = {},
) => createRuntimeCss(preset, options);

const createPlaygroundUnsafeCss = (options: Parameters<typeof createRuntimeCss>[1] = {}) =>
	createRuntimeCss(examplePreset, options);

/**
 * Real pandwind subpath modules the sandbox resolves import statements
 * against, so generated examples can `import { createDesignCss } from
 * "pandwind/design"` exactly like a user project would.
 */
export const SANDBOX_MODULES = {
	"pandwind/css": { createCss: createPlaygroundCss, createNamedAtomsStrategy },
	"pandwind/unsafe/css": { createUnsafeCss: createPlaygroundUnsafeCss },
	"pandwind/css/runtime": { createRuntimeCss, createRuntimeDesignCss },
	"pandwind/design": { createDesignCss: createRuntimeDesignCss },
	"pandwind/cx": { createCx },
	"pandwind/preset": {
		define,
	},
	"pandwind/preset/base": {
		basePreset,
	},
	"pandwind/preset/default": {
		defaultPreset,
	},
	"@pandwind/example-preset": {
		examplePreset,
		define,
	},
} as const;
