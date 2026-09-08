import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import { defineCodemodAdapter, CodemodAdapterKit, type CallPattern } from "../external-adapters.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	CodemodCallPatternFormTag,
	CodemodCallPatternKindTag,
	CodemodPatternId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { createStyleXSourceObjectOptions, normalizeStyleXVariables } from "./stylex.adapter.ts";

const RSD_MODULE = "react-strict-dom";
const RSD_CSS_BINDING = "css";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cssCallPattern = (
	name: CodemodPatternId,
	method: "create" | "keyframes" | "defineVars",
): CallPattern => ({
	name,
	regex: new RegExp(`\\b${RSD_CSS_BINDING}\\.${method}\\s*\\(\\s*\\{`, "g"),
	regexForBinding: (binding: { readonly localName: string }) =>
		new RegExp(`\\b${escapeRegExp(binding.localName)}\\.${method}\\s*\\(\\s*\\{`, "g"),
	semanticBindings: [{ source: RSD_MODULE, imported: RSD_CSS_BINDING }],
	...(method === "keyframes" ? { kind: CodemodCallPatternKindTag.Keyframes } : {}),
	...(method === "create" ? { objectKind: "named" } : {}),
	...(method === "defineVars" ? { transform: normalizeStyleXVariables } : {}),
});

const cssResidualPattern = (name: string, method: "createTheme" | "props"): CallPattern => ({
	name,
	regex: new RegExp(`\\b${RSD_CSS_BINDING}\\.${method}\\s*\\(`, "g"),
	regexForBinding: (binding: { readonly localName: string }) =>
		new RegExp(`\\b${escapeRegExp(binding.localName)}\\.${method}\\s*\\(`, "g"),
	semanticBindings: [{ source: RSD_MODULE, imported: RSD_CSS_BINDING }],
	form: CodemodCallPatternFormTag.Residual,
	residual: {
		kind:
			method === "createTheme"
				? StyleProgramResidualKindTag.Configuration
				: StyleProgramResidualKindTag.Capability,
		hint:
			method === "createTheme"
				? "React Strict DOM css.createTheme needs the platform compiler and theme context"
				: "React Strict DOM css.props is a host projection; preserve it for a framework-aware rewrite",
	},
});

const compatResidualPattern: CallPattern = {
	name: CodemodPatternId.ReactStrictDomCompat,
	regex: /<compat\.native\b/g,
	regexForBinding: (binding: { readonly localName: string }) =>
		new RegExp(`<${escapeRegExp(binding.localName)}\\.native\\b`, "g"),
	semanticBindings: [{ source: RSD_MODULE, imported: "compat" }],
	form: CodemodCallPatternFormTag.Residual,
	residual: {
		kind: StyleProgramResidualKindTag.Capability,
		hint: "React Strict DOM compat.native requires an explicit native host boundary",
	},
};

function styleExpressionCandidates(
	binding: string | undefined,
	emittedExpression: string,
): readonly string[] {
	return [
		...new Set(
			[binding, emittedExpression].filter((value): value is string => value !== undefined),
		),
	];
}

function isIntrinsicHost(hostOpenTag: string | undefined, source: string | undefined): boolean {
	if (hostOpenTag !== undefined) return /^<([a-z][\w-]*)\b/u.test(hostOpenTag.trim());
	return /<([a-z][\w-]*)\b[^>]*\b(?:className|class)\s*=/su.test(source ?? "");
}

function rewriteRsdHost(
	code: string,
	binding: string | undefined,
	emittedExpression: string,
): { readonly code: string; readonly matched: boolean; readonly tag?: string } {
	for (const expression of styleExpressionCandidates(binding, emittedExpression)) {
		const escaped = escapeRegExp(expression);
		for (const attribute of ["className", "class"] as const) {
			const pattern = new RegExp(`(\\s)${attribute}\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
			const match = pattern.exec(code);
			const literalMatch =
				match ?? new RegExp(`(\\s)${attribute}\\s*=\\s*(?:"[^"]*"|'[^']*')`).exec(code);
			if (literalMatch === null || literalMatch.index === undefined) continue;
			const tagStart = code.lastIndexOf("<", literalMatch.index);
			const tagEnd = code.indexOf(">", literalMatch.index);
			if (tagStart < 0 || tagEnd < 0) continue;
			const openingTag = code.slice(tagStart, tagEnd + 1);
			const tagMatch = /^<([a-z][\w.-]*)\b/u.exec(openingTag);
			if (tagMatch?.[1] === undefined || tagMatch[1].includes(".")) continue;
			const tag = tagMatch[1];
			const replacedAttribute = `${literalMatch[1]}style={${expression}}`;
			const nextTag = openingTag.replace(new RegExp(`^<${escapeRegExp(tag)}\\b`), `<html.${tag}`);
			const nextOpeningTag = nextTag.replace(literalMatch[0], replacedAttribute);
			return {
				code: `${code.slice(0, tagStart)}${nextOpeningTag}${code.slice(tagEnd + 1)}`,
				matched: true,
				tag,
			};
		}
	}
	return { code, matched: false };
}

function rewriteRsdSourceHosts(
	code: string,
	convertedBindings: ReadonlySet<string>,
): { readonly code: string; readonly imports: readonly string[] } {
	let rewritten = code;
	let needsCx = false;
	for (const binding of convertedBindings) {
		const escaped = escapeRegExp(binding);
		const styleAttribute = new RegExp(`\\bstyle\\s*=\\s*\\{`, "g");
		for (const match of [...rewritten.matchAll(styleAttribute)].toReversed()) {
			const start = match.index ?? 0;
			const open = start + match[0].lastIndexOf("{");
			let depth = 0;
			let end = -1;
			for (let index = open; index < rewritten.length; index++) {
				if (rewritten[index] === "{") depth++;
				if (rewritten[index] === "}") {
					depth--;
					if (depth === 0) {
						end = index + 1;
						break;
					}
				}
			}
			if (end < 0) continue;
			const expression = rewritten.slice(open + 1, end - 1).trim();
			if (!new RegExp(`^${escaped}(?:\\.|\\[)`, "u").test(expression)) continue;
			const replacement = expression.startsWith("[")
				? `className={cx(${expression.slice(1, -1)})}`
				: `className={${expression}}`;
			rewritten = `${rewritten.slice(0, start)}${replacement}${rewritten.slice(end)}`;
			needsCx ||= expression.startsWith("[");
		}
	}
	rewritten = rewritten
		.replace(/<html\.([a-z][\w.-]*)\b/gu, "<$1")
		.replace(/<\/html\.([a-z][\w.-]*)>/gu, "</$1>");
	return {
		code: rewritten,
		imports: needsCx ? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"] : [],
	};
}

const reactStrictDom = defineCodemodAdapter({
	id: CodemodAdapterId.ReactStrictDom,
	officialApi: {
		apis: [
			{ name: "css.create", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "html.*", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "style prop", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "css.keyframes", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "css.defineVars", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "css.createTheme", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
			{ name: "compat", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
		],
		compilerIntegrations: ["@stylexjs/babel-plugin", "postcss-react-strict-dom"],
	},
	patterns: [
		cssCallPattern(CodemodPatternId.ReactStrictDomCreate, "create"),
		cssCallPattern(CodemodPatternId.ReactStrictDomKeyframes, "keyframes"),
		cssCallPattern(CodemodPatternId.ReactStrictDomDefineVars, "defineVars"),
		cssResidualPattern("react-strict-dom-create-theme", "createTheme"),
		cssResidualPattern("react-strict-dom-css-props", "props"),
		compatResidualPattern,
	],
	packages: CodemodAdapterKit.dependency(RSD_MODULE, AdapterDependencyKindTag.Runtime),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.ReactStrictDom, "partial", {
		"named-conditions": "exact",
		"named-rules": "exact",
		"dynamic-values": "partial",
		composition: "partial",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/from\s+["']react-strict-dom["']/g, /\bcss\.create\s*\(/g],
	sourceModules: [RSD_MODULE],
	configFiles: ["package.json"],
	sourceObjectOptions: (source, context) =>
		createStyleXSourceObjectOptions(source, context, undefined, RSD_CSS_BINDING),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			handlesSourceHostAttributes: true,
			hostFrameworks: [BuiltinHostFramework.React],
			hostRepresentation: StyleHostRepresentationKind.StyleProp,
			resolveHostRepresentation: ({
				framework,
				sourceFramework,
				hasHostContext,
				program,
				source,
			}) => {
				const hostFramework = sourceFramework ?? framework;
				return (hostFramework === undefined || hostFramework === BuiltinHostFramework.React) &&
					hasHostContext &&
					isIntrinsicHost(program.source?.hostOpenTag, source)
					? StyleHostRepresentationKind.StyleProp
					: undefined;
			},
			rewriteHost: ({ code, binding, emittedExpression, framework, representation }) => {
				if (representation !== StyleHostRepresentationKind.StyleProp)
					return { code, residuals: [] };
				if (framework !== undefined && framework !== BuiltinHostFramework.React)
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: emittedExpression,
								hint: "React Strict DOM target projection requires React JSX",
							},
						],
					};
				const rewritten = rewriteRsdHost(code, binding, emittedExpression);
				return rewritten.matched
					? { code: rewritten.code, residuals: [] }
					: {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: emittedExpression,
									hint: "React Strict DOM target projection requires an intrinsic host with a matching className binding",
								},
							],
						};
			},
		},
		rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			const rewritten = rewriteRsdSourceHosts(code, convertedBindings);
			return { code: rewritten.code, imports: rewritten.imports, residuals: [] };
		},
	},
	emit(program, { programObject }, context) {
		const host = context?.host?.representation === StyleHostRepresentationKind.StyleProp;
		const imports = host
			? ['import { css, html } from "react-strict-dom";']
			: ['import { css } from "react-strict-dom";'];
		if (program.source?.pattern === CodemodPatternId.ReactStrictDomKeyframes)
			return {
				text: `css.keyframes(${programObject(program)})`,
				imports,
				residuals: [],
			};
		if (program.source?.pattern === CodemodPatternId.ReactStrictDomDefineVars)
			return {
				text: `css.defineVars(${programObject(program)})`,
				imports,
				residuals: [],
			};
		if (host && !program.rules.some((rule) => rule.name !== undefined))
			return {
				text: `css.create({ style: ${programObject(program)} }).style`,
				imports,
				residuals: [],
			};
		return {
			text: `css.create(${programObject(program)})`,
			imports,
			residuals: [],
		};
	},
});

export default reactStrictDom;
