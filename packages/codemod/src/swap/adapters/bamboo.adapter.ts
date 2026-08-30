import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import { CodemodAdapterId } from "../identifiers.ts";

/** Bamboo CSS uses the Panda-compatible styled-system object dialect. */
export default defineCodemodAdapter({
	id: CodemodAdapterId.Bamboo,
	patterns: [{ name: "css", regex: /\bcss\s*\(\s*\{/g }],
	packages: {
		packages: [
			dependency("@bamboocss/dev", "development").packages[0]!,
			dependency("@bamboocss/vite", "development").packages[0]!,
		],
		files: ["bamboo.config.ts"],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Bamboo, "partial", {
		"theme-context": "partial",
		"runtime-context": "unsupported",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		components: "unsupported",
		"font-face": "unsupported",
		layers: "exact",
		"supports-rules": "exact",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/styled-system\/css/, /@bamboocss\/(?:dev|vite)/],
	sourceModules: ["styled-system/css"],
	configFiles: ["bamboo.config.ts", "package.json"],
	emit(program, { programObject }) {
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "styled-system/css";'],
		};
	},
});
