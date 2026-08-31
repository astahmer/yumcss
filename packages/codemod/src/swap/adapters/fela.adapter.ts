import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const fela = makeExtraAdapter({
	id: CodemodAdapterId.Fela,
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
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostRepresentation: StyleHostRepresentationKind.Class,
	},
});

export default fela;
