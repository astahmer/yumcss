import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodCallPatternFormTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const goober = makeExtraAdapter({
	id: CodemodAdapterId.Goober,
	officialApi: {
		apis: [
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "styled", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "setup", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "extractCss", status: AdapterOfficialApiStatusTag.Supported },
		],
		ssrHooks: ["extractCss"],
	},
	modules: ["goober"],
	packages: { packages: [{ name: "goober", kind: AdapterDependencyKindTag.Runtime }] },
	detect: [/from\s+["']goober["']/g, /\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*(?:\(\s*\{|`)/g],
	call: /\b(?:css\s*(?:\(\s*\{|`)|styled\.[A-Za-z_$][\w$]*\s*`)/g,
	forms: [CodemodCallPatternFormTag.Object, CodemodCallPatternFormTag.Template],
	prefix: "css(",
	residualPatterns: [
		{
			name: "setup",
			regex: /\bsetup\s*\(/g,
			kind: StyleProgramResidualKindTag.Configuration,
			hint: "Goober setup changes runtime rendering and requires target-aware lowering",
		},
	],
	targetImports: ['import { css } from "goober";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	// Goober's object carrier evaluates scalar expressions at runtime, so a
	// hostless dynamic value does not need to become a residual when Goober is
	// the selected target.
	capabilityOverrides: { "dynamic-values": "exact" },
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
});

export default goober;
