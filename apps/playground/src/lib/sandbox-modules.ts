import { createNamedAtomsStrategy } from "pandwind/css";
import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import { createCx } from "pandwind/cx";
import { definePreset, defineSemanticTokens, defineTheme, defineTokens } from "pandwind/preset";
import { examplePreset } from "@pandwind/example-preset";

const isPreset = (value: unknown): value is typeof examplePreset =>
	value !== null &&
	typeof value === "object" &&
	"conditions" in value &&
	"properties" in value &&
	"strict" in value;

// The playground has a real preset available for bare createCss(), while an
// authored createCss(preset) must run against that exact preset to keep token
// examples honest.
const createPlaygroundCss = (
	presetOrOptions: typeof examplePreset | Parameters<typeof createRuntimeCss>[1] = {},
	options: Parameters<typeof createRuntimeCss>[1] = {},
) =>
	isPreset(presetOrOptions)
		? createRuntimeCss(presetOrOptions, options)
		: createRuntimeCss(examplePreset, presetOrOptions);

/**
 * Real pandwind subpath modules the sandbox resolves import statements
 * against, so generated examples can `import { createDesignCss } from
 * "pandwind/design"` exactly like a user project would.
 */
export const SANDBOX_MODULES = {
	"pandwind/css": { createCss: createPlaygroundCss, createNamedAtomsStrategy },
	"pandwind/css/runtime": { createRuntimeCss, createRuntimeDesignCss },
	"pandwind/design": { createDesignCss: createRuntimeDesignCss },
	"pandwind/cx": { createCx },
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
