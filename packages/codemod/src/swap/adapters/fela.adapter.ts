import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const fela = makeExtraAdapter({
	id: CodemodAdapterId.Fela,
	officialApi: {
		apis: [
			{ name: "renderer.renderRule", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "createRenderer", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "createComponent", status: AdapterOfficialApiStatusTag.Supported },
		],
		pluginSystems: ["plugins", "enhancers"],
		ssrHooks: ["renderer.renderToMarkup", "renderer.renderToSheetList"],
	},
	modules: ["fela", "react-fela"],
	packages: {
		packages: [
			{ name: "fela", kind: "runtime" },
			{ name: "react-fela", kind: "peer" },
		],
	},
	detect: [/from\s+["'](?:fela|react-fela)["']/g, /\brenderer\.renderRule\s*\(\s*\{/g],
	call: /\brenderer\.renderRule\s*\(\s*(?:\(\)\s*=>\s*)?\(?\{/g,
	prefix: "renderer.renderRule(",
	residualPatterns: [
		{
			name: "createRenderer",
			regex: /\bcreateRenderer\s*\((?!\s*\))/g,
			kind: "configuration",
			hint: "Fela renderer configuration and plugins require target-aware lowering",
		},
		{
			name: "createComponent",
			regex: /\bcreateComponent\s*\(/g,
			kind: "component",
			hint: "Fela createComponent requires a host/component lowering",
		},
	],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	// Fela's renderRule object is a runtime carrier for scalar expressions.
	capabilityOverrides: { "dynamic-values": "exact" },
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
});

export default fela;
