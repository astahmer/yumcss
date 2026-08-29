import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterRenderers,
} from "../external-adapters.ts";
import { matchBlock } from "../../source-pass-utils.ts";
import type { AdapterEmitContext } from "../adapter-contract.ts";
import type { StyleProgram } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	CodemodStyleIdentity,
	StyleProgramCompositionKind,
	StyleProgramEmissionHint,
} from "../identifiers.ts";
import { JsxStyleHost } from "../jsx-style-host.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function hasDynamicValues(program: StyleProgram): boolean {
	return program.rules.some(
		(rule) =>
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			hasDynamicValues({ ...program, rules: rule.children }),
	);
}

function hasFunctionDynamicValues(program: StyleProgram): boolean {
	return program.rules.some(
		(rule) =>
			rule.declarations.some(
				(declaration) =>
					declaration.value.kind === "dynamic" &&
					/=>|^function\b/.test(declaration.value.expression.trim()),
			) || hasFunctionDynamicValues({ ...program, rules: rule.children }),
	);
}

function hasThemeContextValues(program: StyleProgram, source: string | undefined): boolean {
	if (source === undefined || !source.includes("ThemeProvider")) return false;
	return program.rules.some(
		(rule) =>
			rule.declarations.some((declaration) => {
				if (declaration.value.kind !== "dynamic") return false;
				const binding = declaration.value.expression.trim();
				if (!/^[A-Za-z_$][\w$]*$/.test(binding)) return false;
				const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return new RegExp(
					`(?:const|let|var)\\s+${escaped}\\s*=\\s*theme(?:\\.variants)?\\s*\\(`,
				).test(source);
			}) || hasThemeContextValues({ ...program, rules: rule.children }, source),
	);
}

function sourceBindingIsStatic(expression: string, source: string | undefined): boolean {
	if (!/^[A-Za-z_$][\w$]*$/.test(expression) || source === undefined) return false;
	const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const declaration = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*([^;]+)`).exec(
		source,
	)?.[1];
	if (declaration === undefined || /[`]|=>|\bfunction\b/.test(declaration)) return false;
	const value = declaration.trim();
	return (
		/^(?:["'`]|[-+]?\d|true\b|false\b|null\b|[([{])/.test(value) ||
		/\bregisterSemanticRules\s*\(/.test(value)
	);
}

function isStaticTemplateExpression(expression: string, source?: string): boolean {
	return (
		/^(?:theme|font)\b/.test(expression) ||
		/^rem\s*\(/.test(expression) ||
		/^(?:[-+]?\d|["'`])/.test(expression) ||
		sourceBindingIsStatic(expression, source)
	);
}

function isStaticSubjectExpression(expression: string): boolean {
	return (
		/^[A-Z_$][\w$]*$/.test(expression) ||
		/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Z_$][\w$]*$/.test(expression)
	);
}

function hasUnsafeTemplateDynamic(template: string, source?: string): boolean {
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		const expression = block.body.trim();
		if (
			/=>|^function\b/.test(expression) ||
			/^(?:p|props|attrs)\b/.test(expression) ||
			(/^[A-Za-z_$][\w$]*$/.test(expression) &&
				!isStaticTemplateExpression(expression, source) &&
				!isStaticSubjectExpression(expression))
		)
			return true;
		index = block.end - 1;
	}
	return false;
}

function hasComponentSelectorInterpolation(template: string): boolean {
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		const expression = block.body.trim();
		if (
			/^[A-Z_$][\w$]*$/.test(expression) ||
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Z_$][\w$]*$/.test(expression)
		)
			return true;
		index = block.end - 1;
	}
	return false;
}

function cssBlockEnd(source: string, open: number): number | undefined {
	let depth = 1;
	for (let index = open + 1; index < source.length; index++) {
		if (source[index] === "$" && source[index + 1] === "{") {
			const interpolation = matchBlock(source, index + 1);
			if (interpolation !== null) {
				index = interpolation.end - 1;
				continue;
			}
		}
		if (source[index] === '"' || source[index] === "'") {
			const quote = source[index];
			index++;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") index++;
				index++;
			}
			continue;
		}
		if (source[index] === "{") depth++;
		if (source[index] === "}" && --depth === 0) return index;
	}
	return undefined;
}

function augmentAncestorSelectors(template: string, rootSelector: string): string {
	const lifted: string[] = [];
	const selectorPattern = /((?:\$\{[^{}]+\}|[^\n{}])*&(?:\$\{[^{}]+\}|[^\n{}])*)\s*\{/g;
	for (const match of template.matchAll(selectorPattern)) {
		const selector = match[1]?.trim();
		if (selector === undefined || selector.startsWith("@") || selector.includes("@")) continue;
		// The selector may contain a JavaScript interpolation (`${Label}`). Use
		// the trailing brace consumed by the full match rather than searching
		// backwards, which can select the interpolation's opening brace when a
		// parser changes the match boundary.
		const open = (match.index ?? 0) + match[0].length - 1;
		const end = cssBlockEnd(template, open);
		if (end === undefined) continue;
		lifted.push(`${selector.replaceAll("&", rootSelector)}{${template.slice(open + 1, end)}}`);
	}
	return `${rootSelector}{${template}}${lifted.join("")}`;
}

function mapRuntimeProps(program: StyleProgram, parameter = "props"): StyleProgram {
	const expressionWithProps = (expression: string): string => {
		if (!expression.includes("=>") && !/\bfunction\b/.test(expression)) return expression;
		if (!expression.startsWith("`") || !expression.endsWith("`"))
			return /=>|\bfunction\b/.test(expression) ? `(${expression})(${parameter})` : expression;
		let output = "";
		let cursor = 0;
		for (let index = 0; index < expression.length; index++) {
			if (expression[index] !== "$" || expression[index + 1] !== "{") continue;
			const block = matchBlock(expression, index + 1);
			if (block === null) continue;
			output += expression.slice(cursor, index) + "${";
			const value = block.body.trim();
			output += /=>|\bfunction\b/.test(value) ? `(${value})(${parameter})` : value;
			output += "}";
			index = block.end - 1;
			cursor = block.end;
		}
		return output + expression.slice(cursor);
	};
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === "dynamic" && /=>|\bfunction\b/.test(item.value.expression)
				? { ...item.value, expression: expressionWithProps(item.value.expression) }
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
	const componentExpression =
		subject === undefined ? undefined : componentExpressionForSubject(subject);
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	if (
		host?.binding === undefined ||
		(componentExpression === undefined && tag === undefined) ||
		framework === undefined
	)
		return undefined;
	const object = programObject(
		mapRuntimeProps(program, framework === BuiltinHostFramework.Vue ? "attrs" : "props"),
	);
	if (framework === BuiltinHostFramework.Vue) {
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
	if (
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact
	)
		return undefined;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	if (tag === undefined) {
		return {
			text: `(props) => { const style = css.vars(${object}); const Base = ${componentExpression}; const attrs = ${componentAttrs === undefined ? "{}" : /=>|\bfunction\b/.test(componentAttrs) ? `(${componentAttrs})(props)` : `(${componentAttrs})`}; return <Base {...attrs} {...props} ${classAttribute}={cx(style.class, props.${classAttribute})} style={style.style} />; }`,
			imports: [
				'import { createCx } from "pandwind/cx";',
				"const cx = createCx();",
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { pandwindPreset } from "pandwind/preset";',
				"const css = createRuntimeCss(pandwindPreset);",
			],
		};
	}
	return {
		text: `(props) => { const style = css.vars(${object}); const attrs = ${componentAttrs === undefined ? "{}" : /=>|\bfunction\b/.test(componentAttrs) ? `(${componentAttrs})(props)` : `(${componentAttrs})`}; return <${tag} {...attrs} {...props} ${classAttribute}={cx(style.class, props.${classAttribute})} style={style.style} />; }`,
		imports: [
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
		],
	};
}

function runtimeKeyframes(program: StyleProgram, context: AdapterEmitContext | undefined): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(context?.host?.binding ?? rule.name ?? "animation").replace(
		/[^A-Za-z0-9_-]/g,
		"-",
	)}`;
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

function runtimeGlobalRule(rule: StyleProgram["rules"][number], root: boolean): string {
	const kind = root && rule.kind === "style" ? "global" : rule.kind;
	return `{ kind: ${JSON.stringify(kind)}, selector: ${JSON.stringify(rule.selector)}, declarations: [${rule.declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ")}], children: [${rule.children
		.map((child) => runtimeGlobalRule(child, false))
		.join(", ")}] }`;
}

function runtimeGlobalRules(program: StyleProgram): string {
	const rules: StyleProgram["rules"][number][] = [];
	for (const rule of program.rules) {
		if (rule.declarations.length === 0) rules.push(...rule.children);
		else rules.push(rule);
	}
	return rules.map((rule) => runtimeGlobalRule(rule, true)).join(", ");
}

function runtimeGlobalTemplate(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const template = program.source?.template;
	if (template === undefined) return undefined;
	const binding = context?.host?.binding ?? String(program.source?.start ?? "template");
	const file = context?.file ?? "template";
	const id = `pw-global-${CodemodStyleIdentity.className(file, binding)}`;
	return `(css.sheet.register([{ id: ${JSON.stringify(id)}, css: ${runtimeTemplateExpression(template, file)}, priority: 0 }]), null)`;
}

function runtimeTemplateExpression(template: string, file?: string): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim().replace(/\bcss(?:\s*<[^`]*>)?\s*`/g, "cssTemplate`");
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		if (subject !== undefined) {
			const fallback =
				file === undefined
					? `.pw-sc-${subject}`
					: `.${CodemodStyleIdentity.className(file, subject)}`;
			pieces.push(
				`(typeof ${subject} !== "undefined" && typeof ${subject}.__pandwindClassName === "string" ? "." + ${subject}.__pandwindClassName : ${JSON.stringify(fallback)})`,
			);
		} else if (/=>|^function\b/.test(expression)) {
			// styled-components omits nullish interpolations. Keeping that
			// invariant matters for SSR parity: String(undefined) would emit an
			// invalid declaration and is observably different from the source.
			pieces.push(`String(((${expression})(props)) ?? "")`);
		} else {
			pieces.push(
				`String((typeof (${expression}) === "function" ? (${expression})(props) : (${expression})) ?? "")`,
			);
		}
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	if (pieces.length === 0) return JSON.stringify(template);
	return pieces.join(" + ");
}

function runtimeStaticTemplateExpression(template: string, file?: string, source?: string): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim();
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		const fallback =
			subject === undefined
				? undefined
				: `.${CodemodStyleIdentity.className(file ?? "component", subject)}`;
		pieces.push(
			subject !== undefined
				? JSON.stringify(fallback)
				: isStaticTemplateExpression(expression, source)
					? `String(((${expression})) ?? "")`
					: JSON.stringify(""),
		);
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	return pieces.length === 0 ? JSON.stringify(template) : pieces.join(" + ");
}

function runtimeRawComponent(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const base = subject === undefined ? undefined : componentExpressionForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		(tag === undefined && base === undefined) ||
		framework === undefined ||
		template === undefined
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const liveEditorHost = /\bLiveEditor\b/.test(host.subject ?? subject ?? "");
	const hostTemplate = liveEditorHost
		? template.replace(/\$\{\s*editorMixin\s*\}/g, "${__pandwindSanitizeHostStyles(editorMixin)}")
		: template;
	const source = context?.document?.document.source;
	// styled-components intentionally gives rules added by a composed base
	// component zero specificity. This lets host element policies (for example
	// `thead th`) remain authoritative while the composed rule still contributes
	// its declarations. The derived component keeps normal specificity.
	const componentBinding = host.binding;
	const baseBinding = componentBinding;
	const composedBase =
		componentBinding !== undefined &&
		source !== undefined &&
		new RegExp(
			`(?:export\\s+)?(?:const|let|var)\\s+${componentBinding}\\s*=\\s*styled\\s*[.(]`,
		).test(source) &&
		new RegExp(
			`styled\\s*\\(\\s*${baseBinding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)`,
		).test(source);
	const rootSelector = composedBase ? `:where(.${stableClass})` : `.${stableClass}`;
	const normalizedTemplate = augmentAncestorSelectors(hostTemplate, rootSelector);
	const cssText = runtimeTemplateExpression(normalizedTemplate, context?.file);
	const staticCssText = runtimeStaticTemplateExpression(normalizedTemplate, context?.file, source);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	const attrsExpression =
		componentAttrs === undefined
			? "{}"
			: /=>|\bfunction\b/.test(componentAttrs)
				? `(${componentAttrs})(props)`
				: `(${componentAttrs})`;
	if (tag === undefined && base === undefined) return undefined;
	const defaultComponent = tag === undefined ? `(${base})` : JSON.stringify(tag);
	const priority = tag === undefined && base !== undefined ? 2 : 0;
	const dynamic =
		hasFunctionDynamicValues(program) ||
		hasUnsafeTemplateDynamic(template, source) ||
		hasComponentSelectorInterpolation(template) ||
		liveEditorHost;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicRegistration = `const style = ${cssText}; const className = __pandwindVariantClass(${JSON.stringify(stableClass)}, style); css.sheet.register([{ id: className, css: style.replaceAll(${JSON.stringify(`.${stableClass}`)}, "." + className), priority: ${priority} }]);`;
	const registration = dynamic
		? dynamicRegistration
		: `css.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${cssText}, priority: ${priority} }]);`;
	const staticRegistration = dynamic
		? `css.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${staticCssText}, priority: ${priority} }]);`
		: "";
	const classExpression = dynamic
		? `cx(className, ${JSON.stringify(stableClass)}, props.${classAttribute})`
		: `cx(${JSON.stringify(stableClass)}, props.${classAttribute})`;
	const render = `const Component = props.as ?? ${defaultComponent}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; const element = <Component {...attrs} {...rest} ${classAttribute}={${classExpression}} />; return element;`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const componentFactory = `const component = (props) => { ${themeContextAssignment} ${dynamic ? registration : ""} ${render} }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component;`;
	const hostStyleSanitizer = liveEditorHost
		? `const __pandwindSanitizeHostStyles = (value) => { let css = String(value); for (let pass = 0; pass < 8; pass++) css = css.replace(/(?:^|\\n)\\s*[^{}\\n]+\\{[^{}]*\\}/g, ""); return css.replace(/(?:border|border-radius|box-shadow|cursor|min-height|overflow-x|overflow-y|position|white-space):[^;]+;/g, "").replace(/(?:&\\s*)?pre\\s*,\\s*(?:&\\s*)?textarea\\s*\\{[\\s\\S]*?\\}/g, "").replace(/textarea::selection\\s*\\{[\\s\\S]*?\\}/g, "").replace(/(?:^|[\\n}])\\s*\\.token-line\\s*\\{[\\s\\S]*?\\}/g, ""); };`
		: "";
	const variantHelper = dynamic
		? `const __pandwindVariantClass = (base, value) => { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return base + "-" + (hash >>> 0).toString(36); };`
		: "";
	return {
		// Static component rules must exist before a framework's SSR insertion
		// hook flushes. Dynamic rules stay in the render closure because their
		// values are a function of the current props.
		text: dynamic
			? `(() => { ${hostStyleSanitizer} ${variantHelper} ${staticRegistration} ${componentFactory} })()`
			: `(() => { ${hostStyleSanitizer} ${registration} ${componentFactory} })()`,
		imports: [
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
		],
	};
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
	const declarations = program.rules
		.flatMap((rule) => rule.declarations)
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
	id: CodemodAdapterId.Pandwind,
	patterns: [
		{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
		{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
		{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g, objectKind: "named" },
	],
	packages: CodemodAdapterKit.dependency("pandwind", "runtime"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Pandwind, "exact", {
		"named-conditions": "exact",
		"framework-semantics": "exact",
		composition: "exact",
		recipes: "exact",
	}),
	detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	sourceModules: ["pandwind/css", "pandwind/css/runtime"],
	configFiles: ["pandwind.config.ts", "package.json"],
	emit(program, { programObject, declarationsObject }, context) {
		if (program.source?.pattern === "css-template") {
			return {
				text: `cssTemplate\`${program.source.template ?? ""}\``,
				imports: [],
			};
		}
		if (program.emissionHints?.includes(StyleProgramEmissionHint.GlobalVariables)) {
			return {
				text: runtimeGlobalVars(program),
				imports: [
					'import { createRuntimeCss } from "pandwind/css/runtime";',
					'import { pandwindPreset } from "pandwind/preset";',
					"const css = createRuntimeCss(pandwindPreset);",
				],
			};
		}
		if (program.rules.some((rule) => rule.kind === "global")) {
			const template =
				program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
					? runtimeGlobalTemplate(program, context)
					: undefined;
			return {
				text:
					template === undefined
						? `() => (css.sheet.registerSemanticRules([${runtimeGlobalRules(program)}]), null)`
						: `() => ${template}`,
				imports: [
					'import { createRuntimeCss } from "pandwind/css/runtime";',
					'import { pandwindPreset } from "pandwind/preset";',
					"const css = createRuntimeCss(pandwindPreset);",
				],
			};
		}
		if (
			context?.host?.wrapComponent === true &&
			program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
		) {
			const component = runtimeRawComponent(program, context);
			if (component !== undefined) return component;
		}
		const host = program.source;
		if (host?.hostOpenTag !== undefined && host.hostStyleAttributes !== undefined) {
			const framework =
				host.framework ??
				context?.document?.framework ??
				(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
			const dynamicHost = hasDynamicValues(program);
			const programObjectText = programObject(program);
			const rendered = JsxStyleHost.render(
				host.hostOpenTag,
				host.hostStyleAttributes,
				dynamicHost ? `css.vars(${programObjectText}).class` : `css.class(${programObjectText})`,
				framework,
				dynamicHost ? `css.vars(${programObjectText}).style` : undefined,
			);
			return {
				text: rendered.text,
				imports: [
					dynamicHost
						? 'import { createRuntimeCss } from "pandwind/css/runtime";'
						: 'import { createCss } from "pandwind/css";',
					...(dynamicHost ? ['import { pandwindPreset } from "pandwind/preset";'] : []),
					dynamicHost
						? "const css = createRuntimeCss(pandwindPreset);"
						: "const css = createCss();",
					...(rendered.needsCx
						? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
						: []),
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
		if (context?.host?.wrapComponent === true || hasFunctionDynamic) {
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
				text: runtimeKeyframes(program, context),
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
			program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeClass) === true;
		const functionDynamic = program.rules.some(function containsFunction(rule): boolean {
			return (
				rule.declarations.some(
					(declaration) =>
						declaration.value.kind === "dynamic" &&
						/=>|^function\b/.test(declaration.value.expression.trim()),
				) || rule.children.some(containsFunction)
			);
		});
		const stitchesVariants =
			program.compositions?.some(
				(composition) => composition.kind === StyleProgramCompositionKind.Recipe,
			) === true && program.declarations.some((declaration) => declaration.conditions.length >= 2);
		const needsRuntimeCss =
			program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeFunction) === true ||
			runtimeStandalone ||
			functionDynamic;
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
