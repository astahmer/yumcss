import {
	allRuleCapabilities,
	dependency,
	type AdapterDefinition,
	type AdapterRenderers,
} from "./definition.ts";
import type { StyleProgram } from "../semantic-ir.ts";

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function runtimeKeyframes(program: StyleProgram): string {
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
	return `(css.sheet.register([{ kind: "keyframes", name: ${JSON.stringify(name)}, children: [${children.join(", ")}] }]), ${JSON.stringify(name)})`;
}

function stitchesRecipeObject(
	program: StyleProgram,
	declarationsObject: AdapterRenderers["declarationsObject"],
): string {
	const declarations = program.declarations;
	const base = declarationsObject(
		declarations.filter((declaration) => declaration.conditions.length === 0),
	);
	const variants = new Map<string, Map<string, typeof declarations>>();
	for (const declaration of declarations) {
		const [variant, value] = declaration.conditions;
		if (variant?.kind !== "named" || value?.kind !== "named") continue;
		const values = variants.get(variant.name) ?? new Map<string, typeof declarations>();
		const list = values.get(value.name) ?? [];
		values.set(value.name, [...list, { ...declaration, conditions: [] }]);
		variants.set(variant.name, values);
	}
	const variantText = [...variants].map(
		([name, values]) =>
			`${JSON.stringify(name)}: { ${[...values]
				.map(([value, list]) => `${JSON.stringify(value)}: ${declarationsObject(list)}`)
				.join(", ")} }`,
	);
	return `{ base: ${base}, variants: { ${variantText.join(", ")} } }`;
}

export const PANDWIND_DEFINITION: AdapterDefinition = {
	id: "pandwind",
	patterns: [
		{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
		{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
		{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g },
	],
	packages: dependency("pandwind", "runtime"),
	capabilities: allRuleCapabilities("pandwind", "exact", {
		"named-conditions": "exact",
		"framework-semantics": "exact",
	}),
	detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	sourceModules: ["pandwind/css", "pandwind/css/runtime"],
	emit(program, { programObject, declarationsObject }) {
		const kind = program.rules[0]?.kind;
		if (kind === "keyframes")
			return {
				text: runtimeKeyframes(program),
				imports: [
					'import { createRuntimeCss } from "pandwind/css/runtime";',
					'import { pandwindPreset } from "pandwind/preset";',
					"const css = createRuntimeCss(pandwindPreset);",
				],
			};
		const named = program.declarations.some((declaration) =>
			declaration.conditions.some((condition) => condition.kind === "named"),
		);
		const dynamic = program.rules.some(function containsDynamic(rule): boolean {
			return (
				rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
				rule.children.some(containsDynamic)
			);
		});
		const runtimeStandalone =
			dynamic &&
			(kind === "style" || kind === undefined) &&
			(program.source?.adapter === "vanilla-extract" || program.source?.adapter === "treat");
		const stitchesVariants =
			program.source?.adapter === "stitches" &&
			program.declarations.some((declaration) => declaration.conditions.length >= 2);
		return {
			text: stitchesVariants
				? `createRecipe(css, ${stitchesRecipeObject(program, declarationsObject)})`
				: named
					? `css.group(${programObject(program)})`
					: runtimeStandalone
						? `css.class(${programObject(program)})`
						: dynamic
							? `css.vars(${programObject(program)})`
							: `css.class(${programObject(program)})`,
			imports: stitchesVariants
				? [
						'import { createCss } from "pandwind/css";',
						'import { createRecipe } from "pandwind/recipe";',
						"const css = createCss();",
					]
				: runtimeStandalone
					? [
							'import { createRuntimeCss } from "pandwind/css/runtime";',
							'import { pandwindPreset } from "pandwind/preset";',
							"const css = createRuntimeCss(pandwindPreset);",
						]
					: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
};
