import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import type { AdapterRewriteContext, AdapterRewriteResult } from "../adapter-contract.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const rewriteAphroditeApplications = (context: AdapterRewriteContext): AdapterRewriteResult => {
	if (context.targetId !== CodemodAdapterId.Pandwind) return { code: context.code, residuals: [] };
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const binding of context.convertedBindings) {
		const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const cssCall = new RegExp(`\\bcss\\(\\s*${escapedBinding}\\.([A-Za-z_$][\\w$]*)\\s*\\)`, "g");
		for (const match of context.code.matchAll(cssCall)) {
			const rule = match[1];
			if (rule === undefined) continue;
			const start = match.index ?? 0;
			edits.push({ start, end: start + match[0].length, text: `${binding}.${rule}` });
		}
	}
	return { code: SourcePass.applyEdits(context.code, edits), residuals: [] };
};

const aphrodite = makeExtraAdapter({
	id: CodemodAdapterId.Aphrodite,
	officialApi: {
		apis: [
			{ name: "StyleSheet.create", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "@font-face", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "keyframes", status: AdapterOfficialApiStatusTag.Supported },
		],
		ssrHooks: ["renderStatic", "rehydrate"],
	},
	modules: ["aphrodite"],
	packages: { packages: [{ name: "aphrodite", kind: AdapterDependencyKindTag.Runtime }] },
	detect: [/from\s+["']aphrodite["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	targetImports: ['import { StyleSheet } from "aphrodite";'],
	namedObjects: true,
	namedRuleStrategy: StyleNamedRuleStrategy.NativeMap,
	targetPolicy: {
		handlesHostRewrites: true,
		dynamicClassCarrier: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [
			BuiltinHostFramework.React,
			BuiltinHostFramework.Preact,
			BuiltinHostFramework.Solid,
			BuiltinHostFramework.Vue,
			BuiltinHostFramework.Svelte,
			BuiltinHostFramework.Astro,
		],
		hostRepresentation: StyleHostRepresentationKind.Class,
		resolveHostRepresentation: () => StyleHostRepresentationKind.Class,
	},
	sourceObjectOptions: {
		namedRuleObjects: true,
		arrayRuleKinds: { fontFamily: "font-face" },
	},
	migration: { rewrite: rewriteAphroditeApplications },
	targetEmit: (program, context, programObject) => {
		if (context?.host?.representation !== StyleHostRepresentationKind.Class) return undefined;
		const named = program.rules.some((rule) => rule.name !== undefined);
		if (named) return undefined;
		return {
			text: `css(StyleSheet.create({ style: ${programObject(program)} }).style)`,
			imports: ['import { StyleSheet, css } from "aphrodite";'],
			residuals: [],
		};
	},
});

export default {
	...aphrodite,
	parse(source: string, context: AdapterParseContext) {
		const parsed = aphrodite.parse(source, context);
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program),
			})),
		};
	},
};
