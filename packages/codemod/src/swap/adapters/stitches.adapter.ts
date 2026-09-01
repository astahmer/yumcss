import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type { AdapterConfigContext, AdapterProjectConfig } from "../adapter-contract.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleProgramCompositionKind,
} from "../identifiers.ts";
import { matchBlock } from "../../sources.ts";
import { applyEdits } from "../../source-pass-utils.ts";
import { parseObjectLiteral, type LitValue } from "../parse.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import { TokenCatalog } from "../tokens.ts";

function literalValue(value: LitValue): unknown {
	if (Array.isArray(value)) return value.map(literalValue);
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(value.keys.map(({ key, value: child }) => [key, literalValue(child)]));
}

function stitchesTheme(source: string): TokenCatalog | undefined {
	for (const match of source.matchAll(/\bcreateStitches\s*\(/g)) {
		const open = source.indexOf("{", (match.index ?? 0) + match[0].length);
		if (open < 0) continue;
		const block = matchBlock(source, open);
		if (block === null) continue;
		const config = parseObjectLiteral(block.body);
		const theme = config?.keys.find((entry) => entry.key === "theme")?.value;
		if (theme !== undefined && typeof theme === "object" && !Array.isArray(theme))
			return TokenCatalog.fromNested(literalValue(theme) as Record<string, unknown>);
	}
	return undefined;
}

function stitchesValue(value: StyleValue, catalog: TokenCatalog | undefined): StyleValue {
	if (catalog === undefined || value.kind !== "literal" || typeof value.value !== "string")
		return value;
	const reference = /^\$([^$]+)\$(.+)$/u.exec(value.value);
	if (reference?.[1] === undefined || reference[2] === undefined) return value;
	const match = catalog.findByReference([reference[1]], reference[2].replaceAll("$", "."));
	return match === undefined ? value : { kind: "literal", value: match.resolved };
}

function stitchesTransform(program: StyleProgram): StyleProgram {
	const unresolved = new Set<string>();
	const visit = (rule: StyleProgram["rules"][number]): void => {
		for (const declaration of rule.declarations) {
			if (declaration.value.kind === "literal" && typeof declaration.value.value === "string") {
				const value = declaration.value.value;
				if (/^\$[^$]+\$.+/u.test(value)) unresolved.add(value);
			}
		}
		for (const child of rule.children) visit(child);
	};
	for (const rule of program.rules) visit(rule);
	return unresolved.size === 0
		? program
		: {
				...program,
				residuals: [
					...program.residuals,
					...Array.from(unresolved, (text) => ({
						kind: "configuration",
						text,
						hint: "Stitches token reference was not found in static createStitches theme config",
					})),
				],
			};
}

function stitchesConfig(context: AdapterConfigContext): AdapterProjectConfig {
	const tokenCatalog = stitchesTheme(context.source)?.contract;
	return {
		adapter: CodemodAdapterId.Stitches,
		root: context.root,
		files: [context.file],
		values: {},
		...(tokenCatalog === undefined ? {} : { tokenCatalog }),
	};
}

function removeStitchesBootstrap(code: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of code.matchAll(
		/\b(?:const|let|var)\s+\{\s*css\s*\}\s*=\s*createStitches\s*\(/g,
	)) {
		const start = match.index ?? 0;
		let cursor = start + match[0].length;
		while (/\s/u.test(code[cursor] ?? "")) cursor++;
		let end: number;
		if (code[cursor] === ")") {
			end = cursor + 1;
		} else if (code[cursor] === "{") {
			const block = matchBlock(code, cursor);
			if (block === null) continue;
			end = block.end;
		} else {
			continue;
		}
		while (/\s/u.test(code[end] ?? "")) end++;
		if (code[end] === ")") end++;
		if (code[end] === ";") end++;
		edits.push({ start, end, text: "" });
	}
	let rewritten = applyEdits(code, edits);
	if (!/\bcreateStitches\s*\(/.test(rewritten))
		rewritten = rewritten.replace(
			/import\s*\{\s*createStitches\s*\}\s*from\s*["']@stitches\/(?:react|core)["'];?\s*/g,
			"",
		);
	return rewritten;
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Stitches,
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g, transform: stitchesTransform },
		{ name: "globalCss", kind: "global", regex: /\bglobalCss\s*\(\s*\{/g },
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	packages: CodemodAdapterKit.dependency("@stitches/react", "peer"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Stitches, "exact", {
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
		components: "exact",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Component,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			hostFrameworks: [BuiltinHostFramework.React],
			hostFrameworkConversions: [
				{
					from: BuiltinHostFramework.Solid,
					to: BuiltinHostFramework.React,
					canConvert: ({ file, source }) =>
						/\.(?:jsx|tsx)$/.test(file) &&
						!/\b(?:createSignal|createMemo|createEffect)\s*\(|\bon:|\buse:|\bclass\s*=/.test(
							source,
						),
				},
				{
					from: BuiltinHostFramework.Vue,
					to: BuiltinHostFramework.React,
					canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
					rewriteDocument: ({ code, targetFramework }) => rewriteVueSfcToJsx(code, targetFramework),
				},
			],
		},
		rewrite: ({ code, targetId, complete }) =>
			targetId === CodemodAdapterId.Pandwind && complete
				? { code: removeStitchesBootstrap(code), residuals: [] }
				: { code, residuals: [] },
	},
	detectPatterns: [/@stitches\/(?:react|core)/, /\bcreateStitches\s*\(/],
	sourceModules: ["@stitches/react", "@stitches/core"],
	configFiles: ["stitches.config.ts", "package.json"],
	loadConfig: stitchesConfig,
	sourceObjectOptions: (_source, context) => {
		const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
		return {
			variantContainerKeys: ["variants"],
			valueTransforms: {
				"*": (value: StyleValue) => stitchesValue(value, catalog),
			},
			...(context.source.includes("variants")
				? { compositions: [{ kind: StyleProgramCompositionKind.Recipe, reference: "variants" }] }
				: {}),
		};
	},
	emit(program, { firstKind, programObject }) {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@stitches/react";'],
			};
		if (kind === "global")
			return {
				text: `globalCss(${programObject(program)})`,
				imports: ['import { globalCss } from "@stitches/react";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@stitches/react";'],
		};
	},
});
