import { StyleRuleKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
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
	modules: ["treat"],
	packages: { packages: [{ name: "treat", kind: AdapterDependencyKindTag.Development }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
	residualPatterns: [
		{
			name: "createTheme",
			regex: /\bcreateTheme\s*\(/g,
			kind: StyleProgramResidualKindTag.Configuration,
			hint: "Treat createTheme requires theme-aware target lowering",
		},
	],
	targetImports: ['import { style } from "treat";'],
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
		moduleFile: {
			acceptedSuffixes: [".treat.ts", ".treat.js"],
			outputExtension: ".treat.ts",
			importSpecifierExtension: ".treat",
			unsupportedFileHint: "Treat styles must be emitted from a .treat.ts or .treat.js module",
		},
		handlesHostRewrites: true,
		dynamicClassCarrier: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
});

export default {
	...treat,
	parse(source: string, context: AdapterParseContext) {
		const parsed = treat.parse(source, context);
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program),
			})),
		};
	},
};
