import { createDesignCss } from "pandwind/design";
import {
	definePreset,
	defineSemanticTokens,
	defineTheme,
	defineTokens,
	examplePreset,
} from "pandwind/preset";

/**
 * Real pandwind subpath modules the sandbox resolves import statements
 * against, so generated examples can `import { createDesignCss } from
 * "pandwind/design"` exactly like a user project would.
 */
export const SANDBOX_MODULES = {
	"pandwind/design": { createDesignCss },
	"pandwind/preset": { definePreset, defineSemanticTokens, defineTheme, defineTokens, examplePreset },
} as const;
