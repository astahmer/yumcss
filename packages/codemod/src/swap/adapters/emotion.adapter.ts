import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { StyleProgramResidualKindTag, StyleRuleKindTag } from "../semantic-ir.ts";
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

export default defineCodemodAdapter({
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
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		},
		rewrite: ({ code, targetId, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			return {
				code: code
					.replace(/<Global\s+styles=\{(?:\{[\s\S]*\}|[^{}]+)\}\s*\/>/g, "<></>")
					.replace(
						/(export const [A-Za-z_$][\w$]*\s*=\s*\(\)\s*=>)\s*\(\)\s*=>\s*(\(css\.sheet\.registerSemanticRules)/g,
						"$1 $2",
					),
				residuals: [],
			};
		},
	},
	emit(program, { firstKind, programObject }, context) {
		const kind = firstKind(program);
		if (kind === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@emotion/css";'],
			};
		if (kind === StyleRuleKindTag.Global)
			return {
				text: `injectGlobal(${programObject(program)})`,
				imports: ['import { injectGlobal } from "@emotion/css";'],
			};
		if (
			program.source?.subject !== undefined &&
			context?.host?.representation !== StyleHostRepresentationKind.Class
		)
			return {
				text: `${program.source.subject}(${programObject(program)})`,
				imports: ['import styled from "@emotion/styled";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
});
