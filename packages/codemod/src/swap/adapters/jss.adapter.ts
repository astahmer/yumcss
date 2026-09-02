import { SourcePass } from "../../source-pass-utils.ts";
import type { AdapterRewriteContext, AdapterRewriteResult } from "../adapter-contract.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
} from "../identifiers.ts";

function rewriteImperativeApplications(context: AdapterRewriteContext): AdapterRewriteResult {
	if (context.targetId !== CodemodAdapterId.Pandwind || !context.complete) {
		return { code: context.code, residuals: [] };
	}
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const application =
		/\b([A-Za-z_$][\w$]*)\.getRule\(\s*["']([A-Za-z_$][\w$]*)["']\s*\)\.applyTo\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
	for (const match of context.code.matchAll(application)) {
		const sheet = match[1];
		const rule = match[2];
		const element = match[3];
		if (sheet === undefined || rule === undefined || element === undefined) continue;
		if (!context.convertedBindings.has(sheet)) continue;
		const start = match.index ?? 0;
		edits.push({
			start,
			end: start + match[0].length,
			text: `${element}.classList.add(${sheet}.${rule})`,
		});
	}
	return { code: SourcePass.applyEdits(context.code, edits), residuals: [] };
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Jss,
	officialApi: {
		apis: [
			{ name: "createUseStyles", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "createStyleSheet", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "createRule", status: AdapterOfficialApiStatusTag.Supported },
		],
		configEntrypoints: ["jss.config.js"],
		pluginSystems: ["plugins", "jss.setup"],
		ssrHooks: ["SheetsRegistry", "JssProvider"],
	},
	patterns: [
		{ name: "jss-useStyles", regex: /\bcreateUseStyles\s*\(\s*\{/g, objectKind: "named" },
		{
			name: "jss-styleSheet",
			regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*\{/g,
			objectKind: "named",
		},
		{
			name: "jss-styleSheet-reference",
			regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
			form: "reference",
			objectKind: "named",
		},
		{ name: "jss-createRule", regex: /\b(?:jss\.)?createRule\s*\(\s*\{/g, objectKind: "named" },
	],
	packages: {
		packages: [
			CodemodAdapterKit.dependency("jss", "runtime").packages[0]!,
			CodemodAdapterKit.dependency("react-jss", "peer").packages[0]!,
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Jss, "unsupported", {
		"named-conditions": "exact",
		"named-rules": "exact",
		"dynamic-values": "partial",
		"rule-level": "partial",
		"global-rules": "unsupported",
		keyframes: "unsupported",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/from\s+["'](?:jss|react-jss)["']/, /\bcreate(?:UseStyles|StyleSheet)\s*\(/],
	sourceModules: ["jss", "react-jss"],
	configFiles: ["jss.config.js", "package.json"],
	sourceObjectOptions: { namedRuleObjects: true },
	migration: {
		rewrite: rewriteImperativeApplications,
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
	},
	emit(program, { programObject }, context) {
		if (context?.host?.representation === StyleHostRepresentationKind.Class) {
			const named = program.rules.some((rule) => rule.name !== undefined);
			const sheet = `jss.createStyleSheet(${named ? programObject(program) : `{ style: ${programObject(program)} }`}).attach().classes`;
			return {
				text: named ? sheet : `${sheet}.style`,
				imports: ['import jss from "jss";'],
			};
		}
		const subject = program.source?.subject ?? "createUseStyles";
		const jssInstanceMethod = /^(?:jss\.)?create(?:StyleSheet|Rule)$/.test(subject);
		const expression =
			subject === "createStyleSheet"
				? `jss.createStyleSheet(${programObject(program)})`
				: subject === "createRule"
					? `jss.createRule(${programObject(program)})`
					: `${subject}(${programObject(program)})`;
		return {
			text: expression,
			imports: jssInstanceMethod
				? ['import jss from "jss";']
				: ['import { createUseStyles } from "react-jss";'],
		};
	},
});
