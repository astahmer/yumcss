import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

const style9 = makeExtraAdapter({
	id: CodemodAdapterId.Style9,
	officialApi: {
		apis: [
			{ name: "style9.create", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "style9", status: AdapterOfficialApiStatusTag.Supported },
		],
		compilerIntegrations: ["style9/babel", "style9/webpack"],
	},
	modules: ["style9"],
	packages: { packages: [{ name: "style9", kind: AdapterDependencyKindTag.Runtime }] },
	detect: [/from\s+["']style9["']/g, /\bstyle9\.create\s*\(\s*\{/g],
	call: /\bstyle9\.create\s*\(\s*\{/g,
	prefix: "style9.create(",
	targetImports: ['import style9 from "style9";'],
	namedObjects: true,
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	sourceObjectOptions: { namedRuleObjects: true },
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
	targetEmit: (program, context, programObject) => {
		if (context?.host?.representation !== StyleHostRepresentationKind.Class) return undefined;
		if (program.rules.some((rule) => rule.name !== undefined)) return undefined;
		return {
			text: `style9(style9.create({ style: ${programObject(program)} }).style)`,
			imports: ['import style9 from "style9";'],
			residuals: [],
		};
	},
	migration: {
		rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			let rewritten = code.replace(/\bstyle9\s*\(/g, "cx(");
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				rewritten = rewritten.replace(
					new RegExp(`\\b${escaped}\\s*\\(\\s*(['"])([A-Za-z_$][\\w$]*)\\1\\s*\\)`, "g"),
					(_match, _quote: string, name: string) => `${binding}.${name}`,
				);
			}
			return {
				code: rewritten,
				imports: ['import { createCx } from "pandwind/cx";', "const cx = createCx();"],
				residuals: [],
			};
		},
	},
});

export default style9;
