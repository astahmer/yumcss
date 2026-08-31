import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { CodemodAdapterId, StyleHostRepresentationKind } from "../identifiers.ts";

const reactNative = makeExtraAdapter({
	id: CodemodAdapterId.ReactNative,
	modules: ["react-native"],
	packages: { packages: [{ name: "react-native", kind: "peer" }] },
	detect: [/from\s+["']react-native["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	targetImports: ['import { StyleSheet } from "react-native";'],
	namedObjects: true,
	sourceObjectOptions: { namedRuleObjects: true },
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.ReactNative],
		hostRepresentation: StyleHostRepresentationKind.StyleProp,
		resolveHostRepresentation: ({ framework }) =>
			framework === undefined || framework === BuiltinHostFramework.ReactNative
				? StyleHostRepresentationKind.StyleProp
				: undefined,
		rewriteHost: ({ code, emittedExpression, binding, framework, representation }) => {
			if (representation !== StyleHostRepresentationKind.StyleProp) return { code, residuals: [] };
			if (framework !== undefined && framework !== BuiltinHostFramework.ReactNative)
				return {
					code,
					residuals: [
						{
							kind: "host-framework",
							text: emittedExpression,
							hint: `React Native style projection requires ${BuiltinHostFramework.ReactNative}`,
						},
					],
				};
			const expression = binding ?? emittedExpression;
			const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const pattern = new RegExp(`(\\s)(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
			if (!pattern.test(code))
				return {
					code,
					residuals: [
						{
							kind: "host-framework",
							text: expression,
							hint: "React Native style projection requires an exact class binding",
						},
					],
				};
			return { code: code.replace(pattern, `$1style={${expression}}`), residuals: [] };
		},
	},
	targetEmit: (program, context, programObject) => {
		if (context?.host?.representation !== StyleHostRepresentationKind.StyleProp) return undefined;
		if (program.rules.some((rule) => rule.name !== undefined)) return undefined;
		return {
			text: `StyleSheet.create({ style: ${programObject(program)} }).style`,
			imports: ['import { StyleSheet } from "react-native";'],
			residuals: [],
		};
	},
});

export default reactNative;
