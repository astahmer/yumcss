import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleProgram } from "../semantic-ir.ts";

const runtimeImports = [
	'import { createRuntimeCss } from "pandwind/css/runtime";',
	'import { pandwindPreset } from "pandwind/preset";',
	"const css = createRuntimeCss(pandwindPreset);",
] as const;

function sourceObjectOptions(source: string) {
	const conditionValues = Object.fromEntries(
		[
			...source.matchAll(
				/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])(@(?:media|supports|container)\b[^'"]*)\2/g,
			),
		].map((match) => [match[1], match[3]]),
	);
	const computedKeys = Object.fromEntries(
		[...source.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g)].map((match) => [
			`${match[1]}.${match[2]}`,
			`--${match[2]}`,
		]),
	);
	return { conditionValues, computedKeys, propertyValueConditions: true };
}

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function keyframesText(program: StyleProgram): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(rule.name ?? "animation").replace(/[^A-Za-z0-9_-]/g, "-")}`;
	const children = rule.children.map(
		(child) =>
			`{ selector: ${JSON.stringify(child.selector ?? "from")}, declarations: [${child.declarations
				.map(
					(declaration) =>
						`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
				)
				.join(", ")}] }`,
	);
	return `(css.sheet.registerSemanticRules([{ kind: "keyframes", name: ${JSON.stringify(name)}, children: [${children.join(", ")}] }]), ${JSON.stringify(name)})`;
}

function varsText(program: StyleProgram): string {
	const declarations = program.declarations;
	const registration = declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ");
	const references = declarations
		.map(
			(declaration) =>
				`${JSON.stringify(declaration.property)}: ${JSON.stringify(`var(${declaration.property})`)}`,
		)
		.join(", ");
	return `(css.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [${registration}] }]), { ${references} })`;
}

export default defineCodemodAdapter({
	id: "stylex",
	patterns: [
		{ name: "stylex-create", regex: /\bstylex\.create\s*\(\s*\{/g, objectKind: "named" },
		{ name: "stylex-keyframes", regex: /\bstylex\.keyframes\s*\(\s*\{/g, kind: "keyframes" },
		{ name: "stylex-define-vars", regex: /\bstylex\.defineVars\s*\(\s*\{/g },
	],
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
			rewritten = rewritten.replaceAll("stylex.defineConsts(", "(");
			rewritten = rewritten.replaceAll("stylex.types.angle(", "(");
			rewritten = rewritten.replace(
				/import\s*\{\s*type\s+StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
				"type StyleXStyles = Record<string, string> | string;",
			);
			rewritten = rewritten.replaceAll("stylex.StyleXStyles", "Record<string, string> | string");
			rewritten = rewritten.replace(
				/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*stylex\.defineMarker\(\)/g,
				(_match, declaration: string, binding: string) =>
					`${declaration} ${binding} = ${JSON.stringify(`pw-marker-${binding}`)}`,
			);
			rewritten = rewritten.replaceAll("stylex.defaultMarker()", '"pw-default-marker"');
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
				rewritten = rewritten.replace(
					new RegExp(
						`\\bstylex\\.props\\((\\s*${escaped}(?:\\s*\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\]))`,
						"g",
					),
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
		if (program.source?.pattern === "stylex-keyframes") {
			return {
				text: keyframesText(program),
				imports: runtimeImports,
			};
		}
		if (program.source?.pattern === "stylex-define-vars") {
			return {
				text: varsText(program),
				imports: runtimeImports,
			};
		}
		return {
			text: `css.group(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
});
