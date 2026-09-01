import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterRenderers,
} from "../external-adapters.ts";
import { matchBlock } from "../../source-pass-utils.ts";
import type {
	AdapterConfigContext,
	AdapterEmitContext,
	AdapterProjectConfig,
	AdapterTargetMigrationPolicy,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import type { StyleProgram } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	CodemodPatternId,
	CodemodStyleIdentity,
	StyleProgramCompositionKind,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
} from "../identifiers.ts";
import { JsxStyleHost } from "../jsx-style-host.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { TokenCatalog } from "../tokens.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "../project-module-loader.ts";
import { dirnameDocumentPath, isAbsoluteDocumentPath, joinDocumentPath } from "../../path-utils.ts";

const PANDWIND_TARGET_POLICY: AdapterTargetMigrationPolicy = {
	handlesHostRewrites: true,
	handlesFrameworkSemantics: true,
	hostRepresentation: StyleHostRepresentationKind.Class,
	standaloneHostRepresentation: StyleHostRepresentationKind.Class,
	resolveHostRepresentation: ({ program, hasHostContext, framework }) => {
		if (hasHostContext || program.source?.subject === undefined)
			return StyleHostRepresentationKind.Class;
		if (
			framework === BuiltinHostFramework.React ||
			framework === BuiltinHostFramework.Preact ||
			framework === BuiltinHostFramework.Solid ||
			framework === BuiltinHostFramework.Vue
		)
			return StyleHostRepresentationKind.Component;
		return StyleHostRepresentationKind.Class;
	},
	rewriteComponent: ({ code, binding, framework, emittedExpression, representation }) => {
		if (representation !== StyleHostRepresentationKind.Component)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: "Pandwind class projection should use the shared host rewriter",
					},
				],
			};
		if (
			framework !== BuiltinHostFramework.React &&
			framework !== BuiltinHostFramework.Preact &&
			framework !== BuiltinHostFramework.Solid &&
			framework !== BuiltinHostFramework.Vue
		)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: `Pandwind static component projection requires a supported host, got ${framework}`,
					},
				],
			};
		// The Pandwind emitter owns the component wrapper for this representation.
		// Preview calls pass the binding; the final emitted expression already has
		// the wrapper and must not be wrapped a second time.
		if (emittedExpression !== binding) return { code, residuals: [] };
		return { code, residuals: [] };
	},
	requiresHostWrapper: ({ source, binding }) => {
		const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return (
			/\b(?:from\s+|import\s*\()?['"]styled-components['"]/.test(source) &&
			(new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source) ||
				new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`).test(source) ||
				new RegExp(`<${escaped}(?:\\s|/?>)`).test(source))
		);
	},
	handlesRawTemplate: () => true,
	handlesTemplateFragment: (program) => program.source?.pattern === CodemodPatternId.CssTemplate,
};

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

const PANDWIND_TOKEN_GROUPS: ReadonlyArray<readonly [RegExp, string]> = [
	[/color$/i, "colors"],
	[/^(?:background|border|outline|text)Color$/i, "colors"],
	[/^(?:fill|stroke)$/i, "colors"],
	[/radius$/i, "radii"],
	[/^(?:font)?size$/i, "fontSizes"],
	[/^fontWeight$/i, "fontWeights"],
	[/^lineHeight$/i, "lineHeights"],
	[/^letterSpacing$/i, "letterSpacings"],
	[/^fontFamily$/i, "fonts"],
	[/shadow$/i, "shadows"],
	[/^(?:zIndex)$/i, "zIndices"],
	[/^(?:padding|margin|gap|inset)/i, "spacing"],
	[/^(?:width|height|minWidth|maxWidth|minHeight|maxHeight)$/i, "sizes"],
];

function pandwindTokenGroup(property: string): string | undefined {
	return PANDWIND_TOKEN_GROUPS.find(([pattern]) => pattern.test(property))?.[1];
}

/**
 * Prefer a known Pandwind preset token over repeating its resolved literal.
 * The lookup is property-aware: a color may only recover a color token, not a
 * coincidentally equal spacing token. The resolved value stays on the
 * semantic node so validation still compares CSS meaning; the authored token
 * spelling is what the target source receives. Unknown values remain
 * untouched rather than being guessed.
 */
function preserveKnownPresetTokens(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	const catalog =
		TokenCatalog.fromContract(context?.config.tokenCatalog) ??
		TokenCatalog.fromAnyTokens(context?.meta?.tokens);
	if (catalog === undefined) return program;
	return catalog.preserveProgram(
		program,
		pandwindTokenGroup,
		(match) => `$${match.ref.replaceAll(".", "-")}`,
	);
}

const PANDWIND_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) => preserveKnownPresetTokens(program, context),
};

function pandwindConfig(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Pandwind,
		root: context.root,
		files: [context.file],
		values: {},
	};
}

type PresetModule = Record<string, unknown>;

async function importGeneratedPreset(
	bridgePath: string,
	bridgeSource: string,
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<Record<string, Record<string, unknown>> | undefined> {
	const binding = /\bpreset\s*:\s*([A-Za-z_$][\w$]*)/u.exec(bridgeSource)?.[1];
	if (binding === undefined) return undefined;
	for (const match of bridgeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gu)) {
		const imported = match[1]
			?.split(",")
			.map((part) => part.trim().split(/\s+as\s+/u))
			.find((parts) => (parts[1] ?? parts[0]) === binding);
		if (imported === undefined || context.root === undefined) continue;
		const specifier = match[2]!;
		let module: PresetModule | undefined;
		if (specifier.startsWith(".")) {
			const path = joinDocumentPath(dirnameDocumentPath(bridgePath), specifier);
			for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}.mjs`]) {
				module = await loader.importFile<PresetModule>(candidate);
				if (module !== undefined) break;
			}
		} else {
			module = await loader.importPackage<PresetModule>(specifier, context.root);
		}
		const preset = module?.[imported[0]!] as { tokens?: unknown } | undefined;
		if (preset?.tokens === null || typeof preset?.tokens !== "object") continue;
		return preset.tokens as Record<string, Record<string, unknown>>;
	}
	return undefined;
}

async function officialPandwindConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = pandwindConfig(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const sourceFile = isAbsoluteDocumentPath(context.file)
		? context.file
		: joinDocumentPath(context.root, context.file);
	const directories: string[] = [];
	let directory = dirnameDocumentPath(sourceFile);
	for (;;) {
		if (!directories.includes(directory)) directories.push(directory);
		if (directory === context.root || directory === "." || directory === "/") break;
		directory = dirnameDocumentPath(directory);
	}
	for (const candidateDirectory of directories) {
		const interopPath = joinDocumentPath(candidateDirectory, "pandwind.interop.json");
		const interopSource = context.readFile(interopPath);
		if (interopSource === undefined) continue;
		try {
			const interop = JSON.parse(interopSource) as {
				generatedFrom?: { bridge?: string };
			};
			const bridgePath = joinDocumentPath(
				candidateDirectory,
				interop.generatedFrom?.bridge ?? "bridge.ts",
			);
			const bridgeSource = context.readFile(bridgePath);
			if (bridgeSource === undefined)
				throw new Error(`generated bridge not found at ${bridgePath}`);
			const tokens = await importGeneratedPreset(bridgePath, bridgeSource, context, loader);
			if (tokens === undefined)
				throw new Error("generated bridge does not expose a loadable preset");
			const tokenCatalog = TokenCatalog.fromNested(tokens)?.contract;
			if (tokenCatalog === undefined)
				throw new Error("generated preset does not contain statically resolvable tokens");
			return {
				...fallback,
				files: [...fallback.files, interopPath, bridgePath],
				tokenCatalog,
				values: {
					pandwindInteropPath: interopPath,
					pandwindBridgePath: bridgePath,
					officialConfigPackage: "pandwind interop artifact",
				},
			};
		} catch (error) {
			return {
				...fallback,
				residuals: [
					{
						kind: "configuration",
						text: "Pandwind generated design-system metadata",
						hint: `Pandwind interop loading failed: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}
	return fallback;
}

function generatedCssBinding(source: string | undefined): string {
	const input = source ?? "";
	if (/\bimport\s+css\s+from\b/.test(input)) return "pandwindCss";
	for (const candidate of ["css", "pandwindCss", "pwCss"]) {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`\\b(?:const|let|var|import)\\s+(?:default\\s+)?${escaped}\\b`).test(input))
			return candidate;
	}
	return "pandwindCss";
}

function renameGeneratedCssBinding(
	emission: { text: string; imports: readonly string[] },
	binding: string,
): { text: string; imports: readonly string[] } {
	if (binding === "css") return emission;
	const rename = (value: string) =>
		value.replace(/\bcss(?=\s*[.({,;}])/g, binding).replace(/\bcss(?=\s*=)/g, binding);
	return { text: rename(emission.text), imports: emission.imports.map(rename) };
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

function composedBaseClassName(
	subject: string,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const base = componentExpressionForSubject(subject);
	const source = context?.document?.document.source;
	const file = context?.file;
	if (
		base === undefined ||
		!/^[A-Za-z_$][\w$]*$/.test(base) ||
		source === undefined ||
		file === undefined
	)
		return undefined;
	const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`,
	).test(source)
		? CodemodStyleIdentity.className(file, base)
		: undefined;
}

function isComposedBase(binding: string, context: AdapterEmitContext | undefined): boolean {
	const source = context?.document?.document.source;
	if (source === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source);
}

/**
 * Styled-components lowers a subject component's base rules to zero
 * specificity before a derived styled component adds its own rules. Keep
 * that cascade contract in the semantic object passed to Pandwind, including
 * dynamic declarations whose values are carried by css.vars().
 */
function lowerComposedBaseProgram(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	if (context?.host?.binding === undefined || !isComposedBase(context.host.binding, context))
		return program;
	const rules = program.rules.map((rule) =>
		rule.kind === "style" ? { ...rule, selector: ":where(&)" } : rule,
	);
	return {
		...program,
		declarations: [],
		rules: [
			{
				kind: "style",
				conditions: [],
				declarations: [],
				children: rules,
				order: -1,
			},
		],
	};
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
	const isSelectorPosition = (end: number): boolean => {
		for (let index = end; index < template.length; index++) {
			const character = template[index];
			if (character === ";" || character === "}") return false;
			if (character === "{") return true;
		}
		return false;
	};
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		if (isSelectorPosition(block.end)) return true;
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
	const isInsideAtRule = (position: number): boolean => {
		const atRuleStack: boolean[] = [];
		let pendingAtRule = false;
		let quote: string | undefined;
		for (let index = 0; index < position; index++) {
			const character = template[index];
			if (quote !== undefined) {
				if (character === "\\") index++;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'") {
				quote = character;
				continue;
			}
			if (character === "@") {
				pendingAtRule = true;
				continue;
			}
			if (character === "{") {
				atRuleStack.push(pendingAtRule);
				pendingAtRule = false;
				continue;
			}
			if (character === "}") {
				atRuleStack.pop();
				pendingAtRule = false;
				continue;
			}
			if (pendingAtRule && (character === ";" || character === "\n")) pendingAtRule = false;
		}
		return atRuleStack.some(Boolean);
	};
	const lifted: string[] = [];
	const selectorPattern = /((?:\$\{[^{}]+\}|[^\n{}])*&(?:\$\{[^{}]+\}|[^\n{}])*)\s*\{/g;
	for (const match of template.matchAll(selectorPattern)) {
		const selector = match[1]?.trim();
		if (selector === undefined || selector.startsWith("@") || selector.includes("@")) continue;
		if (isInsideAtRule(match.index ?? 0)) continue;
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

function mapThemeRuntimeValues(
	program: StyleProgram,
	source: string | undefined,
	parameter = "props",
): StyleProgram {
	const themeBindings = new Set<string>();
	if (source !== undefined) {
		for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*theme\s*\(/g))
			themeBindings.add(match[1]!);
	}
	const declaration = (item: StyleProgram["declarations"][number]) => {
		if (item.value.kind !== "dynamic" || !themeBindings.has(item.value.expression.trim()))
			return item;
		const binding = item.value.expression.trim();
		return {
			...item,
			value: {
				...item.value,
				expression: `(typeof ${binding} === "function" ? ${binding}(${parameter}) : ${binding})`,
			},
		};
	};
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
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const componentExpression =
		subject === undefined ? undefined : componentExpressionForSubject(subject);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
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
	const mergedClass =
		inheritedClass === undefined
			? `cx(style.class, props.${classAttribute})`
			: `composedCx.vars(style, ${JSON.stringify(inheritedClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	if (tag === undefined) {
		const forwardedProps =
			componentAttrs === undefined
				? "{...props}"
				: /=>|\bfunction\b/.test(componentAttrs)
					? `{...(${componentAttrs})(props), ...props}`
					: `{...(${componentAttrs}), ...props}`;
		return {
			text: `(props) => { ${composedCxBinding}const style = css.vars(${object}); const Base = props.as ?? (${componentExpression}); return <Base ${forwardedProps} ${classAttribute}={cx(style.class, props.${classAttribute})} style={{ ...props.style, ...style.style }} />; }`,
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
		text: `(props) => { ${composedCxBinding}const style = css.vars(${object}); const Component = props.as ?? ${JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${componentAttrs === undefined ? "{}" : /=>|\bfunction\b/.test(componentAttrs) ? `(${componentAttrs})(props)` : `(${componentAttrs})`}; return <Component {...attrs} {...rest} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...style.style }} />; }`,
		imports: [
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
		],
	};
}

/**
 * Preserve a styled component's host API without retaining a CSS runtime.
 * Static declarations are emitted through `css.class`; only the component
 * wrapper remains because consumers may import the styled binding from other
 * modules that are outside the current codemod file.
 */
function staticComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	if (host?.binding === undefined || subject === undefined || framework === undefined)
		return undefined;
	if (
		program.rules.some(function containsDynamic(rule): boolean {
			return (
				rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
				rule.children.some(containsDynamic)
			);
		})
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.Vue
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const loweredProgram = lowerComposedBaseProgram(program, context);
	const style =
		inheritedClass === undefined
			? `css.class(${programObject(loweredProgram)})`
			: `css(${programObject(loweredProgram)})`;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const classExpression = `cx(style, ${JSON.stringify(stableClass)}${inheritedClass === undefined ? "" : `, ${JSON.stringify(inheritedClass)}`}, props.${classAttribute})`;
	const resolvedClassExpression =
		inheritedClass === undefined
			? classExpression
			: classExpression.replace(/^cx\(/, "composedCx(");
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	if (framework === BuiltinHostFramework.Vue) {
		const tagExpression = tag === undefined ? `(${base})` : JSON.stringify(tag);
		return {
			text: `defineComponent({ setup(_props, { attrs, slots }) { const style = ${style}; return () => h(${tagExpression}, { ...attrs, class: cx(style, attrs.class) }, slots.default?.()); } })`,
			imports: [
				'import { defineComponent, h } from "vue";',
				'import { createCss } from "pandwind/css";',
				'import { createCx } from "pandwind/cx";',
				"const css = createCss();",
				"const cx = createCx();",
			],
		};
	}
	return {
		text: `(() => { ${composedCxBinding}const style = ${style}; const component = (props) => { const Component = props.as ?? ${tag === undefined ? `(${base})` : JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; return <Component {...attrs} {...rest} ${classAttribute}={${resolvedClassExpression}} />; }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component; })()`,
		imports: [
			'import { createCss } from "pandwind/css";',
			"const css = createCss();",
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
		],
	};
}

function selectProgramDeclarations(
	program: StyleProgram,
	select: (value: StyleProgram["declarations"][number]["value"]) => boolean,
): StyleProgram {
	const selectRule = (
		rule: StyleProgram["rules"][number],
	): StyleProgram["rules"][number] | undefined => {
		const declarations = rule.declarations.filter((declaration) => select(declaration.value));
		const children = rule.children.flatMap((child) => {
			const selected = selectRule(child);
			return selected === undefined ? [] : [selected];
		});
		return declarations.length === 0 && children.length === 0
			? undefined
			: { ...rule, declarations, children };
	};
	return {
		...program,
		declarations: program.declarations.filter((declaration) => select(declaration.value)),
		rules: program.rules.flatMap((rule) => {
			const selected = selectRule(rule);
			return selected === undefined ? [] : [selected];
		}),
		residuals: [],
	};
}

/**
 * Lower a dynamic styled rule to static atoms plus inline custom properties.
 * This is still a runtime value path, but it does not create or inject CSS at
 * runtime; only values that genuinely depend on props/theme stay dynamic.
 */
function hybridComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		subject === undefined ||
		framework === undefined ||
		program.residuals.some((residual) => residual.kind === "parse") ||
		(template !== undefined && hasComponentSelectorInterpolation(template)) ||
		/\bLiveEditor\b/.test(subject)
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const hasDynamic = program.rules.some(function containsDynamic(rule): boolean {
		return (
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			rule.children.some(containsDynamic)
		);
	});
	if (!hasDynamic) return undefined;
	const staticProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind !== "dynamic"),
		context,
	);
	const dynamicProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind === "dynamic"),
		context,
	);
	const source = context?.document?.document.source;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicObject = programObject(
		mapThemeRuntimeValues(mapRuntimeProps(dynamicProgram, "props"), source, "props"),
	);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const staticClass =
		staticProgram.rules.length === 0
			? '""'
			: inheritedClass === undefined
				? `css.class(${programObject(staticProgram)})`
				: `css(${programObject(staticProgram)})`;
	const mergedClass =
		inheritedClass === undefined
			? `cx(staticClass, dynamic.class, ${JSON.stringify(stableClass)}, props.${classAttribute})`
			: `composedCx.vars(staticClass, dynamic, ${JSON.stringify(inheritedClass)}, ${JSON.stringify(stableClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	return {
		text: `(() => { ${composedCxBinding}const staticClass = ${staticClass}; const component = (props) => { ${themeContextAssignment} const dynamic = css.vars(${dynamicObject}); const Component = props.as ?? ${tag === undefined ? `(${base})` : JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; return <Component {...attrs} {...rest} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component; })()`,
		imports: [
			'import { createCss } from "pandwind/css";',
			"const css = createCss();",
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
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

function runtimeTemplateExpression(template: string, file?: string, parameter = "props"): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim().replace(/\bcss(?:\s*<[^`]*>)?\s*`/g, "`");
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
			pieces.push(`String(((${expression})(${parameter})) ?? "")`);
		} else {
			pieces.push(
				`String((typeof (${expression}) === "function" ? (${expression})(${parameter}) : (${expression})) ?? "")`,
			);
		}
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	if (pieces.length === 0) return JSON.stringify(template);
	return pieces.join(" + ");
}

function runtimeHostTemplateExpression(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = program.source;
	const template = host?.template;
	if (
		host?.hostOpenTag === undefined ||
		host.hostStyleAttributes === undefined ||
		template === undefined
	)
		return undefined;
	const framework =
		host.framework ??
		context?.document?.framework ??
		(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
	const stableClass = CodemodStyleIdentity.className(
		context?.file ?? "host",
		`template-${host.start ?? "0"}`,
	);
	const cssText = `".${stableClass}{" + ${runtimeTemplateExpression(template, context?.file, "undefined")} + "}"`;
	const classExpression = `(() => { const __pandwindCss = ${cssText}; css.sheet.register([{ id: ${JSON.stringify(stableClass)} + ":" + __pandwindCss, css: __pandwindCss, priority: 0 }]); return ${JSON.stringify(stableClass)}; })()`;
	const rendered = JsxStyleHost.render(
		host.hostOpenTag,
		host.hostStyleAttributes,
		classExpression,
		framework,
	);
	return {
		text: rendered.text,
		imports: [
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
			...(rendered.needsCx
				? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
				: []),
		],
	};
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
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const classExpression = dynamic
		? `cx(className, ${JSON.stringify(stableClass)}${inheritedClass === undefined ? "" : `, ${JSON.stringify(inheritedClass)}`}, props.${classAttribute})`
		: `cx(${JSON.stringify(stableClass)}${inheritedClass === undefined ? "" : `, ${JSON.stringify(inheritedClass)}`}, props.${classAttribute})`;
	const resolvedClassExpression =
		inheritedClass === undefined
			? classExpression
			: classExpression.replace(/^cx\(/, "composedCx(");
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	const render = `const Component = props.as ?? ${defaultComponent}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; const element = <Component {...attrs} {...rest} ${classAttribute}={${resolvedClassExpression}} />; return element;`;
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
			? `(() => { ${composedCxBinding}${hostStyleSanitizer} ${variantHelper} ${staticRegistration} ${componentFactory} })()`
			: `(() => { ${composedCxBinding}${hostStyleSanitizer} ${registration} ${componentFactory} })()`,
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
	const rules = program.rules.flatMap(function collect(rule): StyleProgram["rules"] {
		return [rule, ...rule.children.flatMap(collect)];
	});
	return rules
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
				`${JSON.stringify(declaration.property)}: ${JSON.stringify(
					`var(${declaration.property.startsWith("--") ? declaration.property : `--${declaration.property}`})`,
				)}`,
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

export interface PandwindAdapterOptions {
	readonly moduleLoader?: ProjectModuleLoader | null;
}

export function createPandwindAdapter(options: PandwindAdapterOptions = {}) {
	const moduleLoader =
		options.moduleLoader === null
			? undefined
			: (options.moduleLoader ?? NODE_PROJECT_MODULE_LOADER);
	return defineCodemodAdapter({
		id: CodemodAdapterId.Pandwind,
		patterns: [
			{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
			{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
			{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g, objectKind: "named" },
		],
		packages: CodemodAdapterKit.dependency("pandwind", "runtime"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Pandwind, "exact", {
			"named-conditions": "exact",
			"named-rules": "exact",
			"function-values": "exact",
			"framework-semantics": "exact",
			composition: "exact",
			recipes: "exact",
			components: "exact",
		}),
		detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
		sourceModules: ["pandwind/css", "pandwind/css/runtime"],
		configFiles: ["pandwind.config.ts", "pandwind.interop.json", "bridge.ts", "package.json"],
		loadConfig: pandwindConfig,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialPandwindConfig(context, moduleLoader),
				}),
		tokenPolicy: PANDWIND_TOKEN_POLICY,
		migration: { targetPolicy: PANDWIND_TARGET_POLICY },
		emit(program, { programObject, declarationsObject }, context) {
			const cssBinding = generatedCssBinding(context?.document?.document.source);
			const hasFunctionDynamic = program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === "dynamic" &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
			const outputProgram = preserveKnownPresetTokens(program, context);
			const renderProgramObject = (value: StyleProgram): string =>
				programObject(preserveKnownPresetTokens(value, context));
			const finalize = (emission: { text: string; imports: readonly string[] }) => ({
				...renameGeneratedCssBinding(emission, cssBinding),
				// The target object syntax is intentionally a projection of the
				// versioned program. Keep the program attached for validation and
				// downstream tools so nested conditions, rule kinds, and provenance are
				// never inferred back from generated JavaScript.
				semantic: outputProgram,
			});
			if (
				program.source?.pattern === CodemodPatternId.CssTemplate &&
				program.source.hostOpenTag === undefined
			) {
				const hasStaticContent = program.rules.some(function hasContent(rule): boolean {
					return rule.declarations.length > 0 || rule.children.some(hasContent);
				});
				if (
					hasStaticContent &&
					program.residuals.length === 0 &&
					!program.rules.some(function containsDynamic(rule): boolean {
						return (
							rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
							rule.children.some(containsDynamic)
						);
					})
				) {
					return finalize({
						text: `css.class(${renderProgramObject(outputProgram)})`,
						imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
					});
				}
				return finalize({
					text: `cssTemplate\`${program.source.template ?? ""}\``,
					imports: [],
				});
			}
			if (program.emissionHints?.includes(StyleProgramEmissionHint.GlobalVariables)) {
				return finalize({
					text: runtimeGlobalVars(outputProgram),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (program.rules.some((rule) => rule.kind === "global")) {
				const template =
					program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
						? runtimeGlobalTemplate(program, context)
						: undefined;
				return finalize({
					text:
						template === undefined
							? `() => (css.sheet.registerSemanticRules([${runtimeGlobalRules(outputProgram)}]), null)`
							: `() => ${template}`,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (
				context?.host?.representation === StyleHostRepresentationKind.Component &&
				program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
			) {
				const component = runtimeRawComponent(program, context);
				if (component !== undefined) return finalize(component);
			}
			if (context?.host?.representation === StyleHostRepresentationKind.Component) {
				const component = staticComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
				const hybrid = hybridComponent(outputProgram, renderProgramObject, context);
				if (hybrid !== undefined) return finalize(hybrid);
			}
			const host = program.source;
			if (host?.hostOpenTag !== undefined && host.hostStyleAttributes !== undefined) {
				const runtimeHost =
					host.template !== undefined && hasComponentSelectorInterpolation(host.template)
						? runtimeHostTemplateExpression(program, context)
						: undefined;
				if (runtimeHost !== undefined) return finalize(runtimeHost);
				const framework =
					host.framework ??
					context?.document?.framework ??
					(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
				const dynamicHost = hasDynamicValues(program);
				const programObjectText = renderProgramObject(
					hasFunctionDynamic ? mapRuntimeProps(outputProgram, "undefined") : outputProgram,
				);
				const rendered = JsxStyleHost.render(
					host.hostOpenTag,
					host.hostStyleAttributes,
					dynamicHost ? `css.vars(${programObjectText}).class` : `css.class(${programObjectText})`,
					framework,
					dynamicHost ? `css.vars(${programObjectText}).style` : undefined,
				);
				return finalize({
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
				});
			}
			const kind = program.rules[0]?.kind;
			const stylexDynamicGroup =
				program.source?.adapter === CodemodAdapterId.StyleX &&
				program.source.pattern === CodemodPatternId.StyleXCreate;
			if (
				(context?.host?.representation === StyleHostRepresentationKind.Component ||
					hasFunctionDynamic) &&
				!stylexDynamicGroup
			) {
				const component = runtimeComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
			}
			const hasFontFaces = program.rules.some(function containsFontFace(
				rule: StyleProgram["rules"][number],
			): boolean {
				return rule.kind === "font-face" || rule.children.some(containsFontFace);
			});
			if (hasFontFaces) {
				const withoutFontFaces = (
					rule: StyleProgram["rules"][number],
				): StyleProgram["rules"][number] => ({
					...rule,
					children: rule.children
						.filter((child) => child.kind !== "font-face")
						.map(withoutFontFaces),
				});
				const styleProgram = {
					...program,
					rules: program.rules.filter((rule) => rule.kind !== "font-face").map(withoutFontFaces),
				};
				return finalize({
					text: `(css.sheet.registerSemanticRules([${runtimeFontFaces(outputProgram)}]), css.group(${renderProgramObject(styleProgram)}))`,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (kind === "keyframes")
				return finalize({
					text: runtimeKeyframes(outputProgram, context),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			const named =
				program.rules.some((rule) => rule.name !== undefined) ||
				program.declarations.some((declaration) =>
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
				) === true &&
				program.declarations.some((declaration) => declaration.conditions.length >= 2);
			const needsRuntimeCss =
				!stylexDynamicGroup &&
				(program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeFunction) === true ||
					runtimeStandalone ||
					functionDynamic);
			return finalize({
				text: stitchesVariants
					? `createRecipe(css, ${stitchesRecipeObject(outputProgram, declarationsObject)})`
					: named
						? `css.group(${renderProgramObject(outputProgram)})`
						: functionDynamic
							? `css.group(${renderProgramObject(outputProgram)})`
							: runtimeStandalone
								? `css.class(${renderProgramObject(outputProgram)})`
								: dynamic
									? `css.vars(${renderProgramObject(outputProgram)})`
									: `css.class(${renderProgramObject(outputProgram)})`,
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
			});
		},
	});
}
