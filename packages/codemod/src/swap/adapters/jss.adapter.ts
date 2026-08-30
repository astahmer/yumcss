import { applyEdits } from "../../migrate.ts";
import type { AdapterRewriteContext, AdapterRewriteResult } from "../adapter-contract.ts";
import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import { CodemodAdapterId } from "../identifiers.ts";

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
	return { code: applyEdits(context.code, edits), residuals: [] };
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Jss,
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
			dependency("jss", "runtime").packages[0]!,
			dependency("react-jss", "peer").packages[0]!,
		],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Jss, "unsupported", {
		"named-conditions": "exact",
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
	migration: { rewrite: rewriteImperativeApplications },
	emit(program, { programObject }) {
		const subject = program.source?.subject ?? "createUseStyles";
		return {
			text: `${subject}(${programObject(program)})`,
			imports:
				subject === "createStyleSheet"
					? ['import { createStyleSheet } from "jss";']
					: ['import { createUseStyles } from "react-jss";'],
		};
	},
});
