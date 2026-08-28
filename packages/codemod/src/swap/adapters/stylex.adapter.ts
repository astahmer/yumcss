import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

const runtimeImports = [
	'import { createRuntimeCss } from "pandwind/css/runtime";',
	'import { pandwindPreset } from "pandwind/preset";',
	"const css = createRuntimeCss(pandwindPreset);",
] as const;

function sourceObjectOptions(source: string) {
	const conditionValues = Object.fromEntries(
		[...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])(@(?:media|supports|container)\b[^'"]*)\2/g)].map(
			(match) => [match[1], match[3]],
		),
	);
	return { conditionValues, propertyValueConditions: true };
}

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
	sourceObjectOptions,
		migration: {
			prepareDynamic: ({ source, targetId, binding }) => ({
					handled:
						targetId === "pandwind" &&
						binding !== undefined &&
						(new RegExp(
							`\\bstylex\\.props\\([\\s\\S]*?\\b${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*(?:\\.|\\[)`,
						).test(source) ||
							new RegExp(
								`\\bexport\\s+(?:const|let|var)\\s+${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=`,
							).test(source)),
			}),
			rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== "pandwind" || !complete) return { code, residuals: [] };
			let rewritten = code;
			rewritten = rewritten.replace(
				/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*stylex\.defineMarker\(\)/g,
				(_match, declaration: string, binding: string) =>
					`${declaration} ${binding} = ${JSON.stringify(`pw-marker-${binding}`)}`,
			);
			rewritten = rewritten.replaceAll("stylex.defaultMarker()", '"pw-default-marker"');
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
				rewritten = rewritten.replace(
					new RegExp(`\\bstylex\\.props\\((\\s*${escaped}(?:\\s*\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\]))`, "g"),
					"css.props($1",
				);
			}
			rewritten = rewritten.replaceAll("stylex.props(", "css.props(");
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
