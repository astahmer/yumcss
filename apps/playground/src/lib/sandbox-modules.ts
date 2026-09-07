import { createNamedAtomsStrategy } from "pandwind/css";
import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import { definePreset, defineSemanticTokens, defineTheme, defineTokens } from "pandwind/preset";
import { examplePreset } from "@pandwind/example-preset";

// The playground has a real preset available, so its createCss() sandbox
// binding can expose the same generated sheet that a Vite build would emit.
// Authored examples still use the public createCss/createDesignCss imports.
const createPlaygroundCss = (options: Parameters<typeof createRuntimeCss>[1] = {}) =>
	createRuntimeCss(examplePreset, options);

/**
 * Real pandwind subpath modules the sandbox resolves import statements
 * against, so generated examples can `import { createDesignCss } from
 * "pandwind/design"` exactly like a user project would.
 */
export const SANDBOX_MODULES = {
	"pandwind/css": { createCss: createPlaygroundCss, createNamedAtomsStrategy },
	"pandwind/css/runtime": { createRuntimeCss, createRuntimeDesignCss },
	"pandwind/design": { createDesignCss: createRuntimeDesignCss },
	"pandwind/preset": {
		definePreset,
		defineSemanticTokens,
		defineTheme,
		defineTokens,
	},
	"@pandwind/example-preset": {
		examplePreset,
		definePreset,
		defineSemanticTokens,
		defineTheme,
		defineTokens,
	},
} as const;
