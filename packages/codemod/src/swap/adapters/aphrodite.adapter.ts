import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const aphrodite = makeExtraAdapter({
	id: CodemodAdapterId.Aphrodite,
	modules: ["aphrodite"],
	packages: { packages: [{ name: "aphrodite", kind: "runtime" }] },
	detect: [/from\s+["']aphrodite["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	targetImports: ['import { StyleSheet } from "aphrodite";'],
	namedObjects: true,
	namedRuleStrategy: StyleNamedRuleStrategy.NativeMap,
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.React],
		hostRepresentation: StyleHostRepresentationKind.Class,
		resolveHostRepresentation: ({ framework }) =>
			framework === undefined || framework === BuiltinHostFramework.React
				? StyleHostRepresentationKind.Class
				: undefined,
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
