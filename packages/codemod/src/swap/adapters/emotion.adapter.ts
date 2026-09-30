import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import { StyleProgramResidualKindTag, StyleRuleKindTag } from "../semantic-ir.ts";
import type { StyleProgram } from "../semantic-ir.ts";
import {
	CodemodCallPatternKindTag,
	CodemodCallPatternFormTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { dirnameDocumentPath, joinDocumentPath } from "../../path-utils.ts";
import type {
	AdapterDetectionContext,
	AdapterDetectionResult,
	AdapterParseContext,
} from "../adapter-contract.ts";
import { SourceBindingKind, type SourceBinding } from "pandwind/source";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	componentAttrsExpressionForSubject,
	intrinsicTagForSubject,
	wrapComponentExpressionWithAttrs,
} from "../host-component-rewriter.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { staticDomAttrsExpression } from "./react-styled-component.ts";

function importedModulePath(context: AdapterParseContext, specifier: string): string {
	const directory = dirnameDocumentPath(context.file);
	return `${joinDocumentPath(directory.startsWith("/") ? directory : (context.root ?? "."), directory, specifier)}.ts`;
}

function importedStaticValues(
	context: AdapterParseContext,
	text: string,
	seen = new Set<string>(),
): Readonly<Record<string, string>> {
	const values: Record<string, string> = {};
	// The browser migration surface has no project filesystem. Keep the
	// in-memory path deterministic and let the normal expression parser handle
	// unresolved imports instead of attempting Node path resolution.
	if (context.root === undefined || context.readFile === undefined) return values;
	for (const match of text.matchAll(/import\s*\{\s*([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
		const names =
			match[1]
				?.split(",")
				.map((name) => name.trim())
				.filter(Boolean) ?? [];
		const specifier = match[2];
		if (specifier === undefined) continue;
		const file = importedModulePath(context, specifier);
		if (seen.has(file)) continue;
		seen.add(file);
		const imported = context.readFile?.(file);
		if (imported === undefined) continue;
		for (const reexport of imported.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/g)) {
			const targetSpecifier = reexport[1];
			if (targetSpecifier === undefined) continue;
			const targetFile = `${joinDocumentPath(dirnameDocumentPath(file), targetSpecifier)}.ts`;
			if (seen.has(targetFile)) continue;
			seen.add(targetFile);
			const target = context.readFile?.(targetFile);
			if (target === undefined) continue;
			for (const object of target.matchAll(
				/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([\s\S]*?)\}\s*;/g,
			)) {
				const name = object[1];
				if (name === undefined || object[2] === undefined) continue;
				for (const property of object[2].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["']([^"']+)["']/g)) {
					if (property[1] !== undefined && property[2] !== undefined)
						values[`${name}.${property[1]}`] = property[2];
				}
			}
		}
		if (imported.includes("export *"))
			Object.assign(values, importedStaticValues(context, imported, seen));
		for (const name of names) {
			const object = new RegExp(
				`(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
			).exec(imported)?.[1];
			if (object === undefined) continue;
			for (const property of object.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["']([^"']+)["']/g)) {
				if (property[1] !== undefined && property[2] !== undefined)
					values[`${name}.${property[1]}`] = property[2];
			}
		}
	}
	return values;
}

function detectEmotion(
	context: AdapterDetectionContext,
	fallback: () => AdapterDetectionResult,
): AdapterDetectionResult {
	if (
		!/\bcss\s*=\s*\{/.test(context.source) ||
		context.root === undefined ||
		context.readFile === undefined
	)
		return fallback();
	let directory = joinDocumentPath(context.root, dirnameDocumentPath(context.file));
	const root = joinDocumentPath(context.root);
	while (directory.startsWith(root)) {
		for (const candidate of [".babelrc.js", ".babelrc", "babel.config.js", "babel.config.cjs"]) {
			const file = joinDocumentPath(directory, candidate);
			const config = context.readFile(file);
			if (config?.includes("@emotion/react") === true)
				return { matched: true, confidence: 0.95, evidence: [`config:${file}`] };
		}
		if (directory === root) break;
		directory = dirnameDocumentPath(directory);
	}
	return fallback();
}

function canRewriteEmotionHost(program: StyleProgram): boolean {
	const openingTag = program.source?.hostOpenTag;
	if (openingTag === undefined) return true;
	if (
		(program.source?.hostStyleAttributes ?? []).some((attribute) => /^style\s*=/u.test(attribute))
	)
		return false;
	const classAttributes = [...openingTag.matchAll(/(?:^|\s)(?:className|class)\s*=/gu)];
	const classNames = [
		...openingTag.matchAll(/(?:^|\s)className\s*=\s*(?:\{[^{}]*\}|["'][^"']*["'])/gu),
	];
	if (classAttributes.length !== classNames.length || classNames.length > 1) return false;
	const staticClass = /(?:^|\s)className\s*=\s*(["'])([^"']*)\1/u.exec(openingTag);
	return staticClass?.[2]?.includes("\\") !== true;
}

function rewriteEmotionHost({
	code,
	program,
	emittedExpression,
}: {
	readonly code: string;
	readonly program: StyleProgram;
	readonly emittedExpression: string;
}): {
	readonly code: string;
	readonly imports: readonly string[];
	readonly residuals: StyleProgram["residuals"];
} {
	const openingTag = program.source?.hostOpenTag;
	const hostStyleAttributes = program.source?.hostStyleAttributes ?? [];
	if (openingTag === undefined)
		return {
			code,
			imports: [],
			residuals: [],
		};
	if (hostStyleAttributes.some((attribute) => /^style\s*=/u.test(attribute)))
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: openingTag,
					hint: "Emotion class projection cannot preserve the inline priority of a Mantine style prop",
				},
			],
		};
	const openingIndex = code.indexOf(openingTag);
	if (openingIndex < 0)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: openingTag,
					hint: "Emotion class projection could not locate the source JSX host",
				},
			],
		};
	let host = openingTag;
	for (const attribute of hostStyleAttributes) {
		const index = host.indexOf(attribute);
		if (index < 0) continue;
		const whitespace = index > 0 && /[ \t]/u.test(host[index - 1]!) ? 1 : 0;
		host = `${host.slice(0, index - whitespace)}${host.slice(index + attribute.length)}`;
	}
	const classExpression = /(^|\s)className\s*=\s*\{([^{}]*)\}/u.exec(host);
	const staticClass = /(^|\s)className\s*=\s*(["'])([^"']*)\2/u.exec(host);
	if (classExpression !== null && staticClass !== null)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: host,
					hint: "Emotion class projection found multiple className attributes",
				},
			],
		};
	let imports: readonly string[] = [];
	if (classExpression !== null) {
		host = host.replace(
			classExpression[0],
			`${classExpression[1]}className={cx(${classExpression[2]}, ${emittedExpression})}`,
		);
		imports = ['import { cx } from "@emotion/css";'];
	} else if (staticClass !== null) {
		if (staticClass[3]?.includes("\\") === true)
			return {
				code,
				imports: [],
				residuals: [
					{
						kind: StyleProgramResidualKindTag.HostFramework,
						text: host,
						hint: "Emotion class projection cannot safely decode the existing className string",
					},
				],
			};
		host = host.replace(
			staticClass[0],
			`${staticClass[1]}className={cx(${JSON.stringify(staticClass[3] ?? "")}, ${emittedExpression})}`,
		);
		imports = ['import { cx } from "@emotion/css";'];
	} else {
		if (/(?:^|\s)(?:className|class)\s*=/u.test(host))
			return {
				code,
				imports: [],
				residuals: [
					{
						kind: StyleProgramResidualKindTag.HostFramework,
						text: host,
						hint: "Emotion class projection cannot safely merge the existing host class",
					},
				],
			};
		const insertion = /\/\s*>$/u.test(host) ? host.length - 2 : host.length - 1;
		host = `${host.slice(0, insertion).replace(/[ \t]+$/u, "")} className={${emittedExpression}}${host.slice(insertion)}`;
	}
	return {
		code: `${code.slice(0, openingIndex)}${host}${code.slice(openingIndex + openingTag.length)}`,
		imports,
		residuals: [],
	};
}

const emotionAdapter = defineCodemodAdapter({
	id: CodemodAdapterId.Emotion,
	officialApi: {
		pluginSystems: ["@emotion/babel-plugin", "importMap", "macros"],
		compilerIntegrations: ["@emotion/babel-plugin"],
		ssrHooks: ["extractCritical", "renderStylesToString", "renderStylesToNodeStream"],
	},
	patterns: [
		{
			name: "jsx-css",
			regex: /<[A-Za-z_$][\w$.-]*\b/g,
			form: CodemodCallPatternFormTag.JsxStyle,
			styleProps: ["css"],
		},
		{
			name: "css",
			regex: /\bcss\s*\(\s*\{/g,
			semanticBindings: [
				{ source: "@emotion/css", imported: "css" },
				{ source: "@emotion/react", imported: "css" },
			],
			regexForBinding: (binding: SourceBinding) =>
				new RegExp(
					`\\b${(binding.kind === SourceBindingKind.Namespace
						? `${binding.localName}.css`
						: binding.localName
					).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\(\\s*\\{`,
					"g",
				),
		},
		{
			name: "css-template",
			regex: /\bcss\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
			semanticBindings: [
				{ source: "@emotion/css", imported: "css" },
				{ source: "@emotion/react", imported: "css" },
			],
			regexForBinding: (binding: SourceBinding) =>
				new RegExp(
					`\\b${(binding.kind === SourceBindingKind.Namespace
						? `${binding.localName}.css`
						: binding.localName
					).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\``,
					"g",
				),
		},
		{
			name: "styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g,
		},
		{
			name: "styled-function",
			kind: CodemodCallPatternKindTag.Styled,
			regex:
				/\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
			functionCall: {
				functionCall:
					/\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
				subjectFromMatch: (match) =>
					match
						.match(/^styled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*/)?.[0]
						?.trim()
						.replace(/\s+/g, " ")
						.replace(/\.\s+/g, "."),
			},
		},
		{
			name: "styled-template",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "keyframes",
			kind: CodemodCallPatternKindTag.Keyframes,
			regex: /\bkeyframes\s*\(\s*\{/g,
		},
		{
			name: "global",
			kind: CodemodCallPatternKindTag.Global,
			regex: /\b(?:injectGlobal|global)\s*\(\s*\{/g,
		},
		{
			name: "global-template",
			kind: CodemodCallPatternKindTag.Global,
			regex: /\b(?:injectGlobal|global)\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "Global",
			regex: /<\s*Global\b/g,
			form: CodemodCallPatternFormTag.JsxGlobal,
			styleProps: ["styles"],
		},
		{
			name: "runtime-context",
			regex:
				/(?:import[^;\n]*\b(?:ThemeProvider|CacheProvider)\b[^;\n]*;|<(?:ThemeProvider|CacheProvider)\b[^>]*>)/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.RuntimeContext,
				hint: "Emotion runtime providers require target-aware theme/cache lowering",
			},
		},
	],
	packages: {
		packages: [
			{ name: "@emotion/css", kind: AdapterDependencyKindTag.Runtime },
			{ name: "@emotion/styled", kind: AdapterDependencyKindTag.Peer },
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Emotion, "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		"function-values": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/],
	detect: detectEmotion,
	sourceModules: ["@emotion/css", "@emotion/react", "@emotion/styled"],
	configFiles: [".emotionrc", "emotion.config.js", "package.json"],
	sourceObjectOptions: (_source, context) => {
		const references = importedStaticValues(context, context.source);
		return {
			dynamicReferences: references,
			computedKeyResolver: (expression) => references[expression],
			nestedObjectKind: "selector",
		};
	},
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesSourceHostAttributes: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			resolveHostRepresentation: ({ program }) => {
				const subject = program.source?.subject;
				if (subject !== undefined && componentAttrsExpressionForSubject(subject) !== undefined)
					return StyleHostRepresentationKind.Component;
				return canRewriteEmotionHost(program) ? StyleHostRepresentationKind.Class : undefined;
			},
			preflight: ({ program }) => {
				const subject = program.source?.subject;
				if (subject === undefined) return [];
				const attrsExpression = componentAttrsExpressionForSubject(subject);
				if (attrsExpression === undefined) return [];
				const tag = intrinsicTagForSubject(subject);
				if (
					program.source?.framework === BuiltinHostFramework.React &&
					tag !== undefined &&
					staticDomAttrsExpression(
						attrsExpression,
						tag,
						program.source.hostPropFilter?.prefixes,
					) !== undefined
				)
					return [];
				return [
					{
						kind: StyleProgramResidualKindTag.HostFramework,
						text: attrsExpression,
						hint: "Emotion attrs conversion requires a React intrinsic with statically verifiable attributes",
					},
				];
			},
			rewriteHost: ({ code, program, emittedExpression }) =>
				rewriteEmotionHost({ code, program, emittedExpression }),
		},
		rewrite: ({ code, targetId, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			return {
				code: code
					.replace(/<Global\s+styles=\{(?:\{[\s\S]*\}|[^{}]+)\}\s*\/>/g, "<></>")
					.replace(
						/(export const [A-Za-z_$][\w$]*\s*=\s*\(\)\s*=>)\s*\(\)\s*=>\s*(\([A-Za-z_$][\w$]*\.sheet\.registerSemanticRules)/g,
						"$1 $2",
					),
				residuals: [],
			};
		},
	},
	emit(program, { firstKind, programObject, templateCss }, context) {
		const kind = firstKind(program);
		if (kind === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@emotion/css";'],
			};
		if (kind === StyleRuleKindTag.Global)
			return {
				text: `injectGlobal\`${templateCss(program)}\``,
				imports: ['import { injectGlobal } from "@emotion/css";'],
			};
		if (
			program.source?.subject !== undefined &&
			context?.host?.representation !== StyleHostRepresentationKind.Class
		) {
			const subject = program.source.subject;
			const attrsExpression = componentAttrsExpressionForSubject(subject);
			const attrsIndex = subject.indexOf(".attrs");
			const targetSubject = attrsIndex < 0 ? subject : subject.slice(0, attrsIndex).trimEnd();
			const targetExpression = `${targetSubject}(${programObject(program)})`;
			const wrapped = wrapComponentExpressionWithAttrs({
				expression: targetExpression,
				attrsExpression,
				file: context?.file,
				filteredPropPrefixes: program.source?.hostPropFilter?.prefixes,
				framework: context?.host?.framework,
			});
			if (wrapped.residuals.length > 0) return { text: "", residuals: wrapped.residuals };
			return {
				text: wrapped.text,
				...(attrsExpression === undefined ? {} : { componentExpression: true }),
				imports: ['import styled from "@emotion/styled";', ...wrapped.imports],
			};
		}
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
});

export default {
	...emotionAdapter,
	parse: (source: string, context: AdapterParseContext) => {
		const parsed = emotionAdapter.parse(source, context);
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program),
			})),
		};
	},
};
