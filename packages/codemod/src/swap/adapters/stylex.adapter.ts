import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

const runtimeImports = [
	'import { createRuntimeCss } from "pandwind/css/runtime";',
	'import { pandwindPreset } from "pandwind/preset";',
	"const css = createRuntimeCss(pandwindPreset);",
] as const;

export default defineCodemodAdapter({
	id: "stylex",
	patterns: [{ name: "stylex-create", regex: /\bstylex\.create\s*\(\s*\{/g, objectKind: "named" }],
	packages: dependency("@stylexjs/stylex", "peer"),
	capabilities: allRuleCapabilities("stylex", "partial", {
		"dynamic-values": "partial",
		composition: "partial",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@stylexjs\/stylex/, /\bstylex\.create\s*\(/],
	sourceModules: ["@stylexjs/stylex"],
	configFiles: ["package.json"],
	sourceObjectOptions: { nestedObjectKind: "named" },
	migration: {
		prepareDynamic: ({ source, targetId, binding }) => ({
			handled:
				targetId === "pandwind" &&
				binding !== undefined &&
				new RegExp(
					`\\bstylex\\.props\\(\\s*${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\.`,
				).test(source),
		}),
		rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== "pandwind" || !complete) return { code, residuals: [] };
			let rewritten = code;
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
				rewritten = rewritten.replace(
					new RegExp(`\\bstylex\\.props\\((\\s*${escaped}\\s*\\.[A-Za-z_$][\\w$]*)`, "g"),
					"css.props($1",
				);
			}
			return {
				code: rewritten,
				imports: rewritten === code ? [] : runtimeImports,
				residuals: [],
			};
		},
	},
	emit(program, { programObject }) {
		return {
			text: `css.group(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
});
