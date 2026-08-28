import {
	allRuleCapabilities,
	defineCodemodAdapter,
	dependency,
	type AdapterRenderers,
} from "../external-adapters.ts";
import type { AdapterEmitContext } from "../adapter-contract.ts";
import type { StyleProgram } from "../semantic-ir.ts";
import { JsxStyleHost } from "../jsx-style-host.ts";

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function mapRuntimeProps(program: StyleProgram, parameter = "props"): StyleProgram {
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === "dynamic" && /=>|^function\b/.test(item.value.expression.trim())
				? { ...item.value, expression: `(${item.value.expression})(${parameter})` }
				: item.value,
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

function runtimeComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag =
		subject?.match(/^styled\.([a-z][\w-]*)/)?.[1] ??
		subject?.match(/^styled\(\s*["']([a-z][\w-]*)["']\s*\)/)?.[1] ??
		subject?.match(/^styled\(\s*([A-Za-z_$][\w$]*)\s*\)$/)?.[1];
	const framework = host?.framework ?? program.source?.framework;
	if (host?.binding === undefined || tag === undefined || framework === undefined) return undefined;
	const object = programObject(mapRuntimeProps(program, framework === "vue" ? "attrs" : "props"));
	if (framework === "vue") {
		return {
			text: `defineComponent({ setup(_props, { attrs, slots }) { const style = computed(() => css.vars(${object})); return () => h(${JSON.stringify(tag)}, { ...attrs, class: [style.value.class, attrs.class], style: [style.value.style, attrs.style] }, slots.default?.()); } })`,
			imports: [
				'import { computed, defineComponent, h } from "vue";',
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { pandwindPreset } from "pandwind/preset";',
				"const css = createRuntimeCss(pandwindPreset);",
			],
		};
	}
	if (framework !== "solid" && framework !== "react" && framework !== "preact") return undefined;
	const classAttribute = framework === "solid" ? "class" : "className";
	return {
		text: `(props) => { const style = css.vars(${object}); return <${tag} {...props} ${classAttribute}={cx(style.class, props.${classAttribute})} style={style.style} />; }`,
		imports: [
			'import { cx } from "pandwind/cx";',
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
		],
	};
}

function runtimeKeyframes(program: StyleProgram): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(rule.name ?? "animation").replace(/[^A-Za-z0-9_-]/g, "-")}`;
	const children = rule.children.map(
		(child) =>
			`{ kind: "style", selector: ${JSON.stringify(child.selector ?? "from")}, declarations: [${child.declarations
				.map(
					(declaration) =>
						`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
				)
				.join(", ")}] }`,
	);
	return `(css.sheet.registerSemanticRules([{ kind: "keyframes", name: ${JSON.stringify(name)}, children: [${children.join(", ")}] }]), ${JSON.stringify(name)})`;
}

function runtimeFontFaces(program: StyleProgram): string {
	return program.rules
		.filter((rule) => rule.kind === "font-face")
		.map(
			(rule) =>
				`{ kind: "font-face", declarations: [${rule.declarations
					.map(
						(declaration) =>
							`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
					)
					.join(", ")} ] }`,
		)
		.join(", ");
}

function runtimeGlobalVars(program: StyleProgram): string {
	const declarations = program.declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ");
	const references = program.declarations
		.map(
			(declaration) =>
				`${JSON.stringify(declaration.property)}: ${JSON.stringify(`var(${declaration.property})`)}`,
		)
		.join(", ");
	return `(css.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [${declarations}] }]), { ${references} })`;
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

export default defineCodemodAdapter({
	id: "pandwind",
	patterns: [
		{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
		{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
		{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g, objectKind: "named" },
	],
	packages: dependency("pandwind", "runtime"),
	capabilities: allRuleCapabilities("pandwind", "exact", {
		"named-conditions": "exact",
		"framework-semantics": "exact",
	}),
	detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	sourceModules: ["pandwind/css", "pandwind/css/runtime"],
	configFiles: ["pandwind.config.ts", "package.json"],
	emit(program, { programObject, declarationsObject }, context) {
		if (program.source?.adapter === "stylex" && program.source.pattern === "stylex-define-vars") {
			return {
				text: runtimeGlobalVars(program),
				imports: [
					'import { createRuntimeCss } from "pandwind/css/runtime";',
					'import { pandwindPreset } from "pandwind/preset";',
					"const css = createRuntimeCss(pandwindPreset);",
				],
			};
		}
		const host = program.source;
		if (host?.hostOpenTag !== undefined && host.hostStyleAttributes !== undefined) {
			const framework =
				host.framework ??
				context?.document?.framework ??
				(/\.(?:jsx|tsx)$/.test(context?.file ?? "") ? "react" : undefined);
			const rendered = JsxStyleHost.render(
				host.hostOpenTag,
				host.hostStyleAttributes,
				`css.class(${programObject(program)})`,
				framework,
			);
			return {
				text: rendered.text,
				imports: [
					'import { createCss } from "pandwind/css";',
					"const css = createCss();",
					...(rendered.needsCx ? ['import { cx } from "pandwind/cx";'] : []),
				],
			};
		}
		const kind = program.rules[0]?.kind;
		const hasFunctionDynamic = program.rules.some(function containsFunction(rule): boolean {
			return (
				rule.declarations.some(
					(declaration) =>
						declaration.value.kind === "dynamic" &&
						/=>|^function\b/.test(declaration.value.expression.trim()),
				) || rule.children.some(containsFunction)
			);
		});
		if (hasFunctionDynamic) {
			const component = runtimeComponent(program, programObject, context);
			if (component !== undefined) return component;
		}
		if (program.rules.some((rule) => rule.kind === "font-face")) {
			const styleProgram = {
				...program,
				rules: program.rules.filter((rule) => rule.kind !== "font-face"),
			};
			return {
				text: `(css.sheet.registerSemanticRules([${runtimeFontFaces(program)}]), css.group(${programObject(styleProgram)}))`,
				imports: [
					'import { createRuntimeCss } from "pandwind/css/runtime";',
					'import { pandwindPreset } from "pandwind/preset";',
					"const css = createRuntimeCss(pandwindPreset);",
				],
			};
		}
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
		const functionDynamic =
			program.source?.adapter === "stylex" &&
			program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === "dynamic" &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
		const stitchesVariants =
			program.source?.adapter === "stitches" &&
			program.declarations.some((declaration) => declaration.conditions.length >= 2);
		const needsRuntimeCss =
			program.source?.adapter === "stylex" || runtimeStandalone || functionDynamic;
		return {
			text: stitchesVariants
				? `createRecipe(css, ${stitchesRecipeObject(program, declarationsObject)})`
				: named
					? `css.group(${programObject(program)})`
					: functionDynamic
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
				: needsRuntimeCss
					? [
							'import { createRuntimeCss } from "pandwind/css/runtime";',
							'import { pandwindPreset } from "pandwind/preset";',
							"const css = createRuntimeCss(pandwindPreset);",
						]
					: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
});
