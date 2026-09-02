import { StyleRuleKindTag } from "../semantic-ir.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleProgramEmissionHint,
} from "../identifiers.ts";

const treat = makeExtraAdapter({
	id: CodemodAdapterId.Treat,
	officialApi: {
		apis: [
			{ name: "style", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
			{ name: "createTheme", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
		],
	},
	modules: ["@/styles.treat", "treat"],
	packages: { packages: [{ name: "treat", kind: "development" }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
	residualPatterns: [
		{
			name: "createTheme",
			regex: /\bcreateTheme\s*\(/g,
			kind: "configuration",
			hint: "Treat createTheme requires theme-aware target lowering",
		},
	],
	targetImports: ['import { style } from "@/styles.treat";'],
	migration: {
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
			standalone:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
		}),
	},
	sourceObjectOptions: { emissionHints: [StyleProgramEmissionHint.RuntimeClass] },
	targetPolicy: {
		handlesHostRewrites: true,
		dynamicClassCarrier: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
});

export default treat;
