import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const compiled = makeExtraAdapter({
	id: CodemodAdapterId.Compiled,
	officialApi: {
		apis: [
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "cssMap", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "styled", status: AdapterOfficialApiStatusTag.Deprecated },
			{ name: "ClassNames", status: AdapterOfficialApiStatusTag.Deprecated },
		],
		compilerIntegrations: ["@compiled/babel-plugin", "@compiled/webpack-loader"],
	},
	modules: ["@compiled/react", "@compiled/css-in-js"],
	packages: { packages: [{ name: "@compiled/react", kind: "peer" }] },
	detect: [
		/from\s+["']@compiled\/(?:react|css-in-js)["']/g,
		/\b(?:css|styled\.[A-Za-z_$][\w$]*|ClassNames)\s*[(\{]/g,
	],
	call: /\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(\s*\{/g,
	prefix: "css(",
	jsxStyle: {
		regex: /<[A-Za-z_$][\w$.-]*\b/g,
		props: ["css"],
	},
	residualPatterns: [
		{
			name: "cssMap",
			regex: /\bcssMap\s*\(\s*\{/g,
			kind: "composition",
			hint: "Compiled cssMap requires a named target map lowering",
		},
		{
			name: "keyframes",
			regex: /\bkeyframes\s*\(/g,
			kind: "keyframes",
			hint: "Compiled keyframes require rule-level target lowering",
		},
		{
			name: "styled-template",
			regex: /\bstyled\.[A-Za-z_$][\w$]*\s*`(?:\\.|[^`])*`/g,
			kind: "component",
			hint: "Compiled styled subjects require host/component lowering",
		},
		{
			name: "ClassNames",
			regex: /<\s*ClassNames\b[^>]*>(?:[\s\S]*?)<\/\s*ClassNames\s*>/g,
			kind: "component",
			hint: "Compiled ClassNames requires a host-aware render-prop lowering",
		},
	],
	targetImports: ['import { css } from "@compiled/react";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	targetPolicy: {
		handlesHostRewrites: true,
		dynamicClassCarrier: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
});

export default compiled;
