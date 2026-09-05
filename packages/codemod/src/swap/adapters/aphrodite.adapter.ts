import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

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

export default aphrodite;
