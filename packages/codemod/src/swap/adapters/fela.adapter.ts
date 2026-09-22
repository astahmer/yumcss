import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import type { AdapterMatch, AdapterParseContext, AdapterParseResult } from "../adapter-contract.ts";
import {
	StyleProgramResidualKindTag,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	type StyleProgramSource,
} from "../semantic-ir.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

function balancedCall(
	source: string,
	open: number,
): { readonly end: number; readonly body: string } | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth++;
		if (character === ")" && --depth === 0)
			return { end: index + 1, body: source.slice(open + 1, index) };
	}
	return undefined;
}

function topLevelComma(source: string): number | undefined {
	let parens = 0;
	let braces = 0;
	let brackets = 0;
	let quote: string | undefined;
	for (let index = 0; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") parens++;
		else if (character === ")") parens--;
		else if (character === "{") braces++;
		else if (character === "}") braces--;
		else if (character === "[") brackets++;
		else if (character === "]") brackets--;
		else if (character === "," && parens === 0 && braces === 0 && brackets === 0) return index;
	}
	return undefined;
}

function felaComponentResidual(
	context: AdapterParseContext,
	start: number,
	end: number,
	text: string,
	hint: string,
): AdapterMatch {
	const source: StyleProgramSource = {
		file: context.file,
		start,
		end,
		adapter: CodemodAdapterId.Fela,
	};
	return {
		start,
		end,
		sourceText: text,
		program: styleProgramFromRules([], {
			source,
			residuals: [{ kind: StyleProgramResidualKindTag.Component, text, hint }],
		}),
	};
}

function parseFelaComponents(source: string, context: AdapterParseContext): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	for (const match of source.matchAll(/\bcreateComponent\s*\(/g)) {
		const start = match.index ?? 0;
		if (context.document?.isExcluded(start) === true) continue;
		const open = source.indexOf("(", start);
		const call = balancedCall(source, open);
		if (call === undefined) {
			matches.push(
				felaComponentResidual(
					context,
					start,
					source.length,
					source.slice(start),
					"Fela createComponent call is unbalanced",
				),
			);
			continue;
		}
		const firstComma = topLevelComma(call.body);
		if (firstComma === undefined) {
			matches.push(
				felaComponentResidual(
					context,
					start,
					call.end,
					source.slice(start, call.end),
					"Fela createComponent requires a style function and a host component",
				),
			);
			continue;
		}
		const styleSource = call.body.slice(0, firstComma).trim();
		const remaining = call.body.slice(firstComma + 1).trim();
		const secondComma = topLevelComma(remaining);
		const subject = (
			secondComma === undefined ? remaining : remaining.slice(0, secondComma)
		).trim();
		const extraArguments = secondComma === undefined ? "" : remaining.slice(secondComma + 1).trim();
		const staticFunction = /^\(\s*\)\s*=>\s*\(\s*\{/u.exec(styleSource);
		const subjectExpression =
			/^([a-z][\w-]*)$/u.test(subject) || /^["'][a-z][\w-]*["']$/u.test(subject)
				? `styled(${JSON.stringify(subject.replace(/^["']|["']$/gu, ""))})`
				: /^[A-Za-z_$][\w$]*$/u.test(subject)
					? `styled(${subject})`
					: undefined;
		if (staticFunction === null || subjectExpression === undefined || extraArguments !== "") {
			matches.push(
				felaComponentResidual(
					context,
					start,
					call.end,
					source.slice(start, call.end),
					"Fela createComponent requires a static style function, host, and no extra component options",
				),
			);
			continue;
		}
		const objectOpen = source.indexOf("{", open + 1 + staticFunction.index);
		const object = objectOpen === -1 ? undefined : SourcePass.matchBlock(source, objectOpen);
		if (object === undefined || object === null) {
			matches.push(
				felaComponentResidual(
					context,
					start,
					call.end,
					source.slice(start, call.end),
					"Fela createComponent style object is unbalanced",
				),
			);
			continue;
		}
		const program = styleProgramFromSourceObject(object.body, {
			source: {
				file: context.file,
				start,
				end: call.end,
				adapter: CodemodAdapterId.Fela,
				...context.semantic?.source,
				subject: subjectExpression,
				subjectKind: "call",
			},
			sourceOffset: objectOpen + 1,
		});
		matches.push({ start, end: call.end, sourceText: source.slice(start, call.end), program });
	}
	return { matches, residuals: [] };
}

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
			{ name: "fela", kind: AdapterDependencyKindTag.Runtime },
			{ name: "react-fela", kind: AdapterDependencyKindTag.Peer },
		],
	},
	detect: [
		/from\s+["'](?:fela|react-fela)["']/g,
		/\brenderer\.renderRule\s*\(\s*\{/g,
		/\bcreateComponent\s*\(/g,
	],
	call: /\brenderer\.renderRule\s*\(\s*(?:\(\)\s*=>\s*)?\(?\{/g,
	prefix: "renderer.renderRule(",
	residualPatterns: [
		{
			name: "createRenderer",
			regex: /\bcreateRenderer\s*\((?!\s*\))/g,
			kind: StyleProgramResidualKindTag.Configuration,
			hint: "Fela renderer configuration and plugins require target-aware lowering",
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

export default {
	...fela,
	parse(source: string, context: AdapterParseContext): AdapterParseResult {
		const parsed = fela.parse(source, context);
		const components = parseFelaComponents(source, context);
		const matches: AdapterMatch[] = [];
		const residuals = [...parsed.residuals];
		for (const match of parsed.matches) {
			const open = source.indexOf("(", match.start);
			const call = open === -1 ? undefined : balancedCall(source, open);
			if (call === undefined) {
				matches.push(match);
				continue;
			}
			const trailingArguments = source.slice(match.end, call.end - 1).trim();
			if (trailingArguments === "" || trailingArguments === ", {}") {
				matches.push({
					...match,
					end: call.end,
					sourceText: source.slice(match.start, call.end),
				});
				continue;
			}
			residuals.push({
				kind: StyleProgramResidualKindTag.Dynamic,
				text: source.slice(match.start, call.end),
				hint: "Fela renderRule props require a target-aware dynamic projection",
			});
		}
		return {
			matches: [...matches, ...components.matches].toSorted((a, b) => a.start - b.start),
			residuals: [...residuals, ...components.residuals],
		};
	},
};
