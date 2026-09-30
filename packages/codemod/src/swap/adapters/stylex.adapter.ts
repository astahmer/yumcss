import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { SemanticConditionKindTag, StyleRuleKindTag, StyleValueKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter, type CallPattern } from "../external-adapters.ts";
import type { StyleProgram, StyleProgramResidual, StyleValue } from "../semantic-ir.ts";
import type { StyleLowering } from "../lowering.ts";
import { STYLE_LOWERING_SCHEMA } from "../lowering.ts";
import type {
	AdapterEmitContext,
	AdapterNamedStyleUseProjection,
	AdapterParseContext,
} from "../adapter-contract.ts";
import {
	SOURCE_SCANNER_SERVICE,
	SourceBindingKind,
	SourceBindings,
	type SourceBinding,
	type SourceBindingIndex,
} from "pandwind/source";
import { SourcePass } from "../../source-pass-utils.ts";
import { NodeKind, walk, type OxcNode } from "pandwind/tw/literal";
import { parseObjectLiteral } from "../parse.ts";
import {
	CodemodAdapterId,
	CodemodCallPatternKindTag,
	CodemodPatternId,
	StyleProgramConditionOrder,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
	StyleLoweringId,
} from "../identifiers.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

const STYLEX_MODULE = "@stylexjs/stylex";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stylexCallee = (binding: SourceBinding, method: string): string =>
	binding.kind === SourceBindingKind.Namespace || binding.kind === SourceBindingKind.Default
		? `${binding.localName}.${method}`
		: binding.localName;

const stylexMethodPattern = (
	method: string,
	suffix = "\\s*\\(\\s*\\{",
): Pick<CallPattern, "regex" | "semanticBindings" | "regexForBinding"> => ({
	regex: new RegExp(`\\bstylex\\.${method}${suffix}`, "g"),
	semanticBindings: [
		{ source: STYLEX_MODULE, imported: method },
		{ source: STYLEX_MODULE, imported: "default" },
	],
	regexForBinding: (binding) =>
		new RegExp(`\\b${escapeRegExp(stylexCallee(binding, method))}${suffix}`, "g"),
});

function stylexMethodReferences(
	bindings: SourceBindingIndex | undefined,
	method: string,
	sources: readonly string[] = [STYLEX_MODULE],
	fallbackApiName = "stylex",
): readonly string[] {
	const references = sources.flatMap((source) =>
		(bindings?.fromModule(source) ?? [])
			.filter(
				(binding) =>
					!bindings?.isShadowed(binding.localName) &&
					(binding.kind === SourceBindingKind.Namespace ||
						binding.kind === SourceBindingKind.Default ||
						binding.importedName === method),
			)
			.map((binding) => stylexCallee(binding, method)),
	);
	return references.length === 0 ? [`${fallbackApiName}.${method}`] : [...new Set(references)];
}

function stylexBindingsFromSource(source: string, file: string): SourceBindingIndex | undefined {
	try {
		return SourceBindings.fromDocument({
			file,
			source,
			language: SOURCE_SCANNER_SERVICE.languageForFile(file),
		});
	} catch {
		return undefined;
	}
}

function replaceStylexCalls(
	code: string,
	bindings: SourceBindingIndex | undefined,
	method: string,
	replacement: string,
	file = "styles.tsx",
): string {
	const sourceBindings = bindings ?? stylexBindingsFromSource(code, file);
	let rewritten = code;
	for (const callee of stylexMethodReferences(sourceBindings, method)) {
		rewritten = rewritten.replace(
			new RegExp(`\\b${escapeRegExp(callee)}\\s*\\(`, "g"),
			replacement,
		);
	}
	return rewritten;
}

function rewriteStylexPropsClassHost(
	code: string,
	bindings: SourceBindingIndex | undefined,
	convertedBindings: ReadonlySet<string>,
): string {
	const edits: Array<{ readonly start: number; readonly end: number; readonly text: string }> = [];
	const styleReference = `[A-Za-z_$][\\w$]*(?:(?:\\.[A-Za-z_$][\\w$]*)|(?:\\[(?:["'][^"']+["'])\\]))*`;
	for (const callee of stylexMethodReferences(bindings, "props")) {
		const calls = new RegExp(
			`\\b${escapeRegExp(callee)}\\s*\\(\\s*(${styleReference})\\s*\\)`,
			"g",
		);
		for (const match of code.matchAll(calls)) {
			const styleExpression = match[1];
			const callStart = match.index;
			if (styleExpression === undefined || callStart === undefined) continue;
			const styleBinding = /^([A-Za-z_$][\w$]*)/u.exec(styleExpression)?.[1];
			if (styleBinding === undefined || !convertedBindings.has(styleBinding)) continue;
			const callEnd = callStart + match[0].length;
			const spreadPrefix = /\{\s*\.\.\.\s*$/u.exec(code.slice(0, callStart));
			const spreadEnd = /^\s*\}/u.exec(code.slice(callEnd));
			if (spreadPrefix !== null && spreadEnd !== null) {
				const spreadStart = callStart - spreadPrefix[0].length;
				const tagStart = code.lastIndexOf("<", spreadStart);
				const tagEnd = code.indexOf(">", callEnd + spreadEnd[0].length);
				const tag = tagStart < 0 || tagEnd < 0 ? "" : code.slice(tagStart, tagEnd + 1);
				if (/\b(?:className|class)\s*=/u.test(tag)) continue;
				edits.push({
					start: spreadStart,
					end: callEnd + spreadEnd[0].length,
					text: `className={${styleExpression}}`,
				});
				continue;
			}
			const classNameSuffix = /^\.className\b/u.exec(code.slice(callEnd));
			if (classNameSuffix !== null) {
				edits.push({
					start: callStart,
					end: callEnd + classNameSuffix[0].length,
					text: styleExpression,
				});
				continue;
			}
			edits.push({
				start: callStart,
				end: callEnd,
				text: `({ className: ${styleExpression} })`,
			});
		}
	}
	for (const edit of edits.toReversed())
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return code;
}

const isOxcNode = (value: unknown): value is OxcNode =>
	typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const oxcChild = (node: OxcNode, key: string): OxcNode | undefined => {
	const value = node[key];
	return isOxcNode(value) ? value : undefined;
};

const oxcChildren = (node: OxcNode, key: string): readonly OxcNode[] => {
	const value = node[key];
	return Array.isArray(value) ? value.filter(isOxcNode) : [];
};

const oxcRange = (node: OxcNode): { readonly start: number; readonly end: number } | undefined => {
	const start = node.start;
	const end = node.end;
	return typeof start === "number" && typeof end === "number" ? { start, end } : undefined;
};

function stylexPropsResidual(text: string): StyleProgramResidual {
	return {
		kind: StyleProgramResidualKindTag.HostFramework,
		text,
		hint: "StyleX props use require one converted style reference and a target-native host projection",
	};
}

function repeatedStylexPropsSpreadResiduals(
	code: string,
	source: string,
	file: string,
	convertedBindings: ReadonlySet<string>,
): readonly StyleProgramResidual[] {
	if (convertedBindings.size === 0) return [];
	const bindings = stylexBindingsFromSource(source, file);
	const callees = new Set(stylexMethodReferences(bindings, "props"));
	if (callees.size === 0) return [];
	const parsed = SOURCE_SCANNER_SERVICE.parse({
		file,
		source: code,
		language: SOURCE_SCANNER_SERVICE.languageForFile(file),
	});
	if (parsed.errors.length > 0) return [];
	const residuals: StyleProgramResidual[] = [];
	walk(parsed.program, (element) => {
		if (element.type !== NodeKind.JSXElement) return;
		const opening = oxcChild(element, "openingElement");
		if (opening === undefined) return;
		const styleCalls = oxcChildren(opening, "attributes").flatMap((attribute) => {
			if (attribute.type !== NodeKind.JSXSpreadAttribute) return [];
			const call = oxcChild(attribute, "argument");
			if (call?.type !== NodeKind.CallExpression) return [];
			const callee = oxcChild(call, "callee");
			const calleeRange = callee === undefined ? undefined : oxcRange(callee);
			if (calleeRange === undefined || !callees.has(code.slice(calleeRange.start, calleeRange.end)))
				return [];
			const argumentsList = oxcChildren(call, "arguments");
			const argument = argumentsList.length === 1 ? argumentsList[0] : undefined;
			const argumentRange = argument === undefined ? undefined : oxcRange(argument);
			const styleExpression =
				argumentRange === undefined
					? undefined
					: code.slice(argumentRange.start, argumentRange.end);
			const styleRoot =
				styleExpression === undefined
					? undefined
					: /^([A-Za-z_$][\w$]*)/u.exec(styleExpression)?.[1];
			const callRange = oxcRange(call);
			if (styleRoot === undefined || !convertedBindings.has(styleRoot) || callRange === undefined)
				return [];
			return [code.slice(callRange.start, callRange.end)];
		});
		if (styleCalls.length > 1)
			residuals.push({
				kind: StyleProgramResidualKindTag.HostFramework,
				text: styleCalls.join(", "),
				hint: "Multiple StyleX props spreads on one host require a target-specific merge strategy",
			});
	});
	return residuals;
}

function rewriteStylexPropsNamedHosts(
	code: string,
	source: string,
	file: string,
	convertedBindings: ReadonlySet<string>,
	projectNamedStyleUse: AdapterNamedStyleUseProjection | undefined,
): {
	readonly code: string;
	readonly imports: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
} {
	const bindings = stylexBindingsFromSource(source, file);
	const callees = new Set(stylexMethodReferences(bindings, "props"));
	if (callees.size === 0) return { code, imports: [], residuals: [] };
	const hasPropsUse = [...callees].some((callee) =>
		new RegExp(`\\b${escapeRegExp(callee)}\\s*\\(`).test(source),
	);
	if (!hasPropsUse) return { code, imports: [], residuals: [] };
	const parsed = SOURCE_SCANNER_SERVICE.parse({
		file,
		source: code,
		language: SOURCE_SCANNER_SERVICE.languageForFile(file),
	});
	if (parsed.errors.length > 0)
		return {
			code,
			imports: [],
			residuals: [stylexPropsResidual("StyleX JSX host parse")],
		};
	const edits: Array<{ readonly start: number; readonly end: number; readonly text: string }> = [];
	const imports = new Set<string>();
	const residuals: StyleProgramResidual[] = [];
	walk(parsed.program, (element) => {
		if (element.type !== NodeKind.JSXElement) return;
		const opening = oxcChild(element, "openingElement");
		if (opening === undefined) return;
		const openingName = oxcChild(opening, "name");
		const openingNameRange = openingName === undefined ? undefined : oxcRange(openingName);
		if (openingNameRange === undefined) return;
		const attributes = oxcChildren(opening, "attributes");
		for (const attribute of attributes) {
			if (attribute.type !== NodeKind.JSXSpreadAttribute) continue;
			const call = oxcChild(attribute, "argument");
			if (call?.type !== NodeKind.CallExpression) continue;
			const callee = oxcChild(call, "callee");
			const calleeRange = callee === undefined ? undefined : oxcRange(callee);
			if (calleeRange === undefined || !callees.has(code.slice(calleeRange.start, calleeRange.end)))
				continue;
			const argumentsList = oxcChildren(call, "arguments");
			const argument = argumentsList.length === 1 ? argumentsList[0] : undefined;
			const argumentRange = argument === undefined ? undefined : oxcRange(argument);
			const styleExpression =
				argumentRange === undefined
					? undefined
					: code.slice(argumentRange.start, argumentRange.end);
			const styleRoot =
				styleExpression === undefined
					? undefined
					: /^([A-Za-z_$][\w$]*)/u.exec(styleExpression)?.[1];
			if (
				styleExpression === undefined ||
				styleRoot === undefined ||
				!convertedBindings.has(styleRoot)
			)
				continue;
			const hostTag = code.slice(openingNameRange.start, openingNameRange.end);
			const otherAttributes = attributes
				.filter((candidate) => candidate !== attribute)
				.flatMap((candidate) => {
					const range = oxcRange(candidate);
					return range === undefined ? [] : [code.slice(range.start, range.end)];
				});
			const projection = projectNamedStyleUse?.({
				code,
				file,
				styleExpression,
				hostTag,
				hostAttributes: otherAttributes,
				hasChildren: oxcChildren(element, "children").length > 0,
				selfClosing: opening.selfClosing === true,
			});
			if (projection === undefined) {
				const callRange = oxcRange(call);
				residuals.push(
					stylexPropsResidual(
						callRange === undefined ? "stylex.props" : code.slice(callRange.start, callRange.end),
					),
				);
				continue;
			}
			residuals.push(...projection.residuals);
			if (projection.residuals.length > 0) continue;
			const projectedHostTag = projection.hostTag;
			if (
				projectedHostTag === undefined ||
				!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u.test(projectedHostTag)
			) {
				residuals.push(
					stylexPropsResidual(code.slice(openingNameRange.start, openingNameRange.end)),
				);
				continue;
			}
			const attributeRange = oxcRange(attribute);
			if (attributeRange === undefined) {
				residuals.push(stylexPropsResidual("StyleX JSX spread range"));
				continue;
			}
			const replacementAttributes = (projection.attributes ?? []).join(" ");
			if (projectedHostTag !== hostTag)
				edits.push({
					start: openingNameRange.start,
					end: openingNameRange.end,
					text: projectedHostTag,
				});
			edits.push({
				start: attributeRange.start,
				end: attributeRange.end,
				text: replacementAttributes,
			});
			const closing = oxcChild(element, "closingElement");
			const closingName = closing === undefined ? undefined : oxcChild(closing, "name");
			const closingNameRange = closingName === undefined ? undefined : oxcRange(closingName);
			if (closingNameRange !== undefined && projectedHostTag !== hostTag)
				edits.push({
					start: closingNameRange.start,
					end: closingNameRange.end,
					text: projectedHostTag,
				});
			for (const statement of projection.imports ?? []) imports.add(statement);
		}
	});
	const rewritten = SourcePass.applyEdits(code, edits);
	const rewrittenParse = SOURCE_SCANNER_SERVICE.parse({
		file,
		source: rewritten,
		language: SOURCE_SCANNER_SERVICE.languageForFile(file),
	});
	if (rewrittenParse.errors.length > 0) {
		return {
			code: rewritten,
			imports: [...imports],
			residuals: [...residuals, stylexPropsResidual("JSX host after projection")],
		};
	}
	walk(rewrittenParse.program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const callee = oxcChild(node, "callee");
		const range = callee === undefined ? undefined : oxcRange(callee);
		if (range !== undefined && callees.has(rewritten.slice(range.start, range.end))) {
			const callRange = oxcRange(node);
			residuals.push(
				stylexPropsResidual(
					callRange === undefined
						? "stylex.props"
						: rewritten.slice(callRange.start, callRange.end),
				),
			);
		}
	});
	return {
		code: rewritten,
		imports: [...imports],
		residuals: [
			...new Map(
				residuals.map((residual) => [
					`${residual.kind}:${residual.text}:${residual.hint}`,
					residual,
				]),
			).values(),
		],
	};
}

function generatedCssBinding(source: string): string {
	if (/\bimport\s+css\s+from\b/.test(source) && !/\b(?:const|let|var)\s+targetCss\b/.test(source))
		return "targetCss";
	for (const candidate of ["css", "targetCss", "pwCss"]) {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`\\b(?:const|let|var|import)\\s+(?:default\\s+)?${escaped}\\b`).test(source))
			return candidate;
	}
	return "targetCss";
}

function generatedStylexComponentBinding(context: AdapterEmitContext | undefined): string {
	const binding = context?.host?.binding?.replace(/[^A-Za-z0-9_$]/gu, "") || "component";
	const source = context?.document?.document.source ?? "";
	let candidate = `__${binding}Style`;
	let suffix = 2;
	while (new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "u").test(source)) {
		candidate = `__${binding}Style${suffix}`;
		suffix++;
	}
	return candidate;
}

function stylexComponentEmission(
	styleExpression: string,
	context: AdapterEmitContext | undefined,
):
	| {
			readonly text: string;
			readonly generatedStatements: readonly string[];
			readonly componentExpression: true;
	  }
	| undefined {
	const subject = context?.host?.subject;
	if (
		context?.host?.representation !== StyleHostRepresentationKind.Component ||
		subject === undefined ||
		(context.host.framework !== undefined && context.host.framework !== BuiltinHostFramework.React)
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const component = componentExpressionForSubject(subject);
	const defaultComponent = component ?? (tag === undefined ? undefined : JSON.stringify(tag));
	if (defaultComponent === undefined) return undefined;
	const styleBinding = generatedStylexComponentBinding(context);
	const attrs = componentAttrsExpressionForSubject(subject);
	const attrsExpression =
		attrs === undefined
			? "{}"
			: /=>|\bfunction\b/u.test(attrs)
				? `(${attrs})(props)`
				: `(${attrs})`;
	return {
		text: `(props) => { const attrs = ${attrsExpression}; const Component = attrs.as ?? props.as ?? ${defaultComponent}; const { as: _as, ...rest } = props; const { as: _attrsAs, ...forwardedAttrs } = attrs; const styleProps = stylex.props(${styleBinding}); return <Component {...rest} {...forwardedAttrs} className={[styleProps.className, props.className, attrs.className].filter(Boolean).join(" ")} style={{ ...styleProps.style, ...props.style, ...attrs.style }} />; }`,
		generatedStatements: [`const ${styleBinding} = ${styleExpression};`],
		componentExpression: true,
	};
}

function staticImports(binding: string): readonly string[] {
	return [
		'import { createUnsafeCss } from "pandwind/unsafe/css";',
		`const ${binding} = createUnsafeCss();`,
	];
}

function moveStyleAfterPropsSpread(code: string, binding: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const styleAttribute = /\bstyle\s*=\s*\{/g;
	const propsSpread = new RegExp(`\\{\\s*\\.\\.\\.${binding}\\.props\\(`, "g");
	for (const match of code.matchAll(styleAttribute)) {
		const styleStart = match.index ?? 0;
		const open = styleStart + match[0].lastIndexOf("{");
		const styleBlock = SourcePass.matchBlock(code, open);
		if (styleBlock === null) continue;
		const spreadSearch = new RegExp(propsSpread.source, "g");
		spreadSearch.lastIndex = styleBlock.end;
		const spreadMatch = spreadSearch.exec(code);
		if (spreadMatch === null) continue;
		const spreadStart = spreadMatch.index;
		const spreadBlock = SourcePass.matchBlock(code, spreadStart);
		if (spreadBlock === null) continue;
		const between = code.slice(styleBlock.end, spreadStart);
		if (between.trim() !== "") continue;
		edits.push({
			start: styleStart,
			end: spreadBlock.end,
			text: `${code.slice(spreadStart, spreadBlock.end)}${between}${code.slice(styleStart, styleBlock.end)}`,
		});
	}
	for (const edit of edits.toReversed())
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return code;
}

/**
 * JSX applies later attributes after object spreads. StyleX's transform merges
 * its generated class with an existing `className`; a plain Pandwind spread
 * would otherwise be overwritten by the later attribute. Keep that host
 * contract explicit in the migrated source so CSS-module and user classes
 * remain additive.
 */
function mergeClassNameAfterPropsSpread(code: string, binding: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const spread = new RegExp(`\\{\\s*\\.\\.\\.${binding}\\.props\\(`, "g");
	for (const match of code.matchAll(spread)) {
		const spreadStart = match.index ?? 0;
		const spreadBlock = SourcePass.matchBlock(code, spreadStart);
		if (spreadBlock === null) continue;
		const tagEnd = code.indexOf(">", spreadBlock.end);
		if (tagEnd < 0) continue;
		const classNameMatch = /\bclassName\s*=\s*\{/g;
		classNameMatch.lastIndex = spreadBlock.end;
		const className = classNameMatch.exec(code);
		const spreadText = code.slice(spreadStart, spreadBlock.end);
		const propsStart = spreadText.indexOf(".props(");
		const propsEnd = spreadText.lastIndexOf(")");
		if (
			propsStart < 0 ||
			propsEnd <= propsStart ||
			(className !== null && className.index >= tagEnd)
		)
			continue;
		const styleExpression = spreadText.slice(propsStart + ".props(".length, propsEnd).trim();
		if (styleExpression === "") continue;
		if (className !== null) {
			const classBlock = SourcePass.matchBlock(
				code,
				className.index + className[0].lastIndexOf("{"),
			);
			if (classBlock === null || classBlock.end > tagEnd) continue;
			const classExpression = classBlock.body.trim();
			if (classExpression === "") continue;
			edits.push({
				start: className.index + className[0].lastIndexOf("{") + 1,
				end: classBlock.end - 1,
				text: `${binding}.props(${styleExpression}, ${classExpression}).className`,
			});
			continue;
		}
		const staticClassName = /\bclassName\s*=\s*(["'])([^"']*)\1/g;
		staticClassName.lastIndex = spreadBlock.end;
		const staticClass = staticClassName.exec(code);
		if (staticClass === null || staticClass.index >= tagEnd) continue;
		edits.push({
			start: staticClass.index,
			end: staticClass.index + staticClass[0].length,
			text: `className={${binding}.props(${styleExpression}, ${JSON.stringify(staticClass[2]!.trim())}).className}`,
		});
	}
	for (const edit of edits.toReversed())
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return code;
}

function findJsxTagEnd(source: string, start: number): number | undefined {
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			continue;
		}
		if (character === ">" && braces === 0) return index;
	}
	return undefined;
}

function isRuntimeStyleXCarrier(expression: string): boolean {
	return /\b(?:dynamic|stylex)\s*(?:\.|\(|\[)/.test(expression);
}

function rewriteStaticXstyleHosts(source: string, binding: string): string {
	const excluded = SourcePass.computeExcludedRanges(source, "pandwind-stylex-hosts.tsx");
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(/\bxstyle\s*=\s*\{/g)) {
		const attributeStart = match.index ?? 0;
		if (excluded.isExcluded(attributeStart)) continue;
		const open = attributeStart + match[0].lastIndexOf("{");
		const value = SourcePass.matchBlock(source, open);
		if (value === null || isRuntimeStyleXCarrier(value.body)) continue;
		const tagStart = source.lastIndexOf("<", attributeStart);
		if (tagStart < 0 || source.slice(tagStart, attributeStart).includes(">")) continue;
		const tagEnd = findJsxTagEnd(source, tagStart);
		if (tagEnd === undefined || tagEnd < value.end) continue;
		const tag = source.slice(tagStart, tagEnd + 1);
		const expression = value.body.trim();
		if (expression === "") continue;

		const localAttributeEnd = value.end;
		const className = /\bclassName\s*=\s*(\{)/.exec(tag);
		if (className !== null) {
			const classOpen = tagStart + className.index + className[0].lastIndexOf("{");
			const classBlock = SourcePass.matchBlock(source, classOpen);
			if (classBlock === null || classBlock.end > tagEnd) continue;
			const classExpression = classBlock.body.trim();
			if (classExpression === "") continue;
			edits.push({
				start: classOpen + 1,
				end: classBlock.end - 1,
				text: `${binding}.props(${expression}, ${classExpression}).className`,
			});
			edits.push({
				start: attributeStart,
				end: localAttributeEnd,
				text: "",
			});
			continue;
		}
		const staticClassName = /\bclassName\s*=\s*(["'])([^"']*)\1/.exec(tag);
		if (staticClassName !== null) {
			const classStart = tagStart + staticClassName.index;
			const classEnd = classStart + staticClassName[0].length;
			edits.push({
				start: classStart,
				end: classEnd,
				text: `className={${binding}.props(${expression}, ${JSON.stringify(staticClassName[2]!.trim())}).className}`,
			});
			edits.push({
				start: attributeStart,
				end: localAttributeEnd,
				text: "",
			});
			continue;
		}
		edits.push({
			start: attributeStart,
			end: localAttributeEnd,
			text: `className={${binding}.props(${expression}).className}`,
		});
	}
	return SourcePass.applyEdits(source, edits);
}

function stylexWhenCondition(
	expression: string,
	whenCallees: readonly string[] = ["stylex.when"],
): string | undefined {
	for (const callee of whenCallees) {
		const when = expression.match(
			new RegExp(
				`^${escapeRegExp(callee)}\\.(ancestor|descendant|siblingBefore|siblingAfter|anySibling)\\(\\s*(['"])([^'"]+)\\2\\s*(?:,\\s*([A-Za-z_$][\\w$]*))?\\s*\\)$`,
			),
		);
		if (when?.[1] === undefined || when[3] === undefined) continue;
		const marker = when[4] === undefined ? "pw-default-marker" : `pw-marker-${when[4]}`;
		const pseudo = `${marker}${when[3]}`;
		return when[1] === "ancestor"
			? `:where(.${pseudo} *) &`
			: when[1] === "descendant"
				? `&:where(:has(.${pseudo}))`
				: when[1] === "siblingBefore"
					? `:where(.${pseudo} ~ *) &`
					: when[1] === "siblingAfter"
						? `&:where(:has(~ .${pseudo}))`
						: `:where(.${pseudo} ~ *, :has(~ .${pseudo})) &`;
	}
	return undefined;
}

function stylexConditionValues(source: string): Readonly<Record<string, string>> {
	const definitions = new Map<string, string>();
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([\s\S]*?)\2\s*;?/g,
	))
		definitions.set(match[1]!, match[3]!);
	const resolving = new Set<string>();
	const resolve = (name: string): string | undefined => {
		const value = definitions.get(name);
		if (value === undefined || resolving.has(name)) return value;
		resolving.add(name);
		const resolved = value.replace(
			/\$\{([A-Za-z_$][\w$]*)\}/g,
			(match, reference: string) => resolve(reference) ?? match,
		);
		resolving.delete(name);
		return resolved;
	};
	return Object.fromEntries(
		[...definitions.keys()]
			.map((name) => [name, resolve(name)])
			.filter((entry): entry is [string, string] => entry[1]?.startsWith("@") === true),
	);
}

export interface StyleXImportedReferenceResolver {
	importedScope(file: string, program: unknown): ReadonlyMap<string, unknown>;
}

function importedStyleReferences(
	context: AdapterParseContext,
	resolver: StyleXImportedReferenceResolver | undefined,
): Readonly<Record<string, string>> {
	if (resolver === undefined) return {};
	if (!context.file.startsWith("/") && context.root === undefined) return {};
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: context.file,
			source: context.source,
			language: SOURCE_SCANNER_SERVICE.languageForFile(context.file),
		});
		const scope = resolver.importedScope(context.file, parsed.program);
		const references: Record<string, string> = {};
		for (const [binding, value] of scope) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			for (const [key, child] of Object.entries(value)) {
				if (typeof child !== "string" && typeof child !== "number") continue;
				references[`${binding}.${key}`] = String(child);
				references[`${binding}['${key}']`] = String(child);
				references[`${binding}["${key}"]`] = String(child);
			}
		}
		return references;
	} catch {
		return {};
	}
}

export function createStyleXSourceObjectOptions(
	source: string,
	context: AdapterParseContext,
	resolver: StyleXImportedReferenceResolver | undefined,
	apiName = "stylex",
) {
	const sourceModules = context.sourceModules ?? [STYLEX_MODULE];
	const defineVarsCallees = stylexMethodReferences(
		context.bindings,
		"defineVars",
		sourceModules,
		apiName,
	);
	const whenCallees = stylexMethodReferences(context.bindings, "when", sourceModules, apiName);
	const conditionValues = stylexConditionValues(source);
	const computedKeys = Object.fromEntries([
		...[...source.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g)].map((match) => [
			`${match[1]}.${match[2]}`,
			`--${match[2]}`,
		]),
		...[...source.matchAll(/\b([A-Za-z_$][\w$]*)\[(['"])(--[^'"]+)\2\]/g)].map((match) => [
			match[0],
			match[3],
		]),
	]);
	const dynamicReferences: Record<string, string> = {
		...stylexVariableReferences(source, defineVarsCallees),
		...importedStyleReferences(context, resolver),
	};
	return {
		conditionValues,
		namedRuleObjects: true,
		computedKeys,
		computedKeyResolver: (expression: string) => stylexWhenCondition(expression, whenCallees),
		propertyValueConditions: true,
		propertyValueConditionNames: STYLEX_PROPERTY_NAMES,
		preserveDefaultGroup: true,
		canonicalization: {
			ignoredConditions: [{ kind: "named" as const, name: "base" }],
			conditionalOrder: StyleProgramConditionOrder.Depth,
		},
		valueTransforms: { "*": stylexNumericValue },
		dynamicReferences,
	};
}

function stylexVariableReferences(
	source: string,
	defineVarsCallees: readonly string[],
): Readonly<Record<string, string>> {
	const references: Record<string, string> = {};
	for (const callee of defineVarsCallees) {
		const escapedCallee = escapeRegExp(callee);
		for (const match of source.matchAll(
			new RegExp(
				`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapedCallee}\\s*\\(`,
				"g",
			),
		)) {
			const binding = match[1];
			if (binding === undefined) continue;
			const open = source.indexOf("{", (match.index ?? 0) + match[0].length);
			if (open < 0) continue;
			const block = SourcePass.matchBlock(source, open);
			if (block === null) continue;
			const variables = parseObjectLiteral(block.body);
			for (const entry of variables?.keys ?? [])
				references[`${binding}.${entry.key}`] = `var(--${entry.key})`;
		}
	}
	return references;
}

export interface StyleXAdapterOptions {
	readonly crossModuleResolver?: StyleXImportedReferenceResolver;
}

const STYLEX_UNITLESS_PROPERTIES = new Set([
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"boxFlex",
	"boxFlexGroup",
	"boxOrdinalGroup",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexNegative",
	"flexOrder",
	"flexPositive",
	"flexShrink",
	"fontWeight",
	"gridArea",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnSpan",
	"gridColumnStart",
	"gridRow",
	"gridRowEnd",
	"gridRowSpan",
	"gridRowStart",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"WebkitLineClamp",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth",
	"scale",
]);

// StyleX permits a nested condition object both as a named style (for example
// `focusRing: { ':focus-visible': ... }`) and as a property value (for example
// `color: { default: ..., ':hover': ... }`). The parser needs the adapter's
// CSS-property vocabulary to distinguish those two shapes without guessing
// from arbitrary user-defined style names.
const STYLEX_PROPERTY_NAMES = new Set([
	...STYLEX_UNITLESS_PROPERTIES,
	"accentColor",
	"alignContent",
	"alignItems",
	"alignSelf",
	"all",
	"animation",
	"animationDirection",
	"animationDuration",
	"animationFillMode",
	"animationName",
	"animationPlayState",
	"animationTimingFunction",
	"appearance",
	"aspectRatio",
	"backdropFilter",
	"backfaceVisibility",
	"background",
	"backgroundAttachment",
	"backgroundBlendMode",
	"backgroundClip",
	"backgroundColor",
	"backgroundImage",
	"backgroundOrigin",
	"backgroundPosition",
	"backgroundPositionX",
	"backgroundPositionY",
	"backgroundRepeat",
	"backgroundSize",
	"blockSize",
	"border",
	"borderBlock",
	"borderBlockColor",
	"borderBlockEnd",
	"borderBlockEndColor",
	"borderBlockEndStyle",
	"borderBlockEndWidth",
	"borderBlockStart",
	"borderBlockStartColor",
	"borderBlockStartStyle",
	"borderBlockStartWidth",
	"borderBlockStyle",
	"borderBlockWidth",
	"borderBottom",
	"borderBottomColor",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	"borderBottomStyle",
	"borderBottomWidth",
	"borderCollapse",
	"borderColor",
	"borderEndEndRadius",
	"borderEndStartRadius",
	"borderInline",
	"borderInlineColor",
	"borderInlineEnd",
	"borderInlineEndColor",
	"borderInlineEndStyle",
	"borderInlineEndWidth",
	"borderInlineStart",
	"borderInlineStartColor",
	"borderInlineStartStyle",
	"borderInlineStartWidth",
	"borderInlineStyle",
	"borderInlineWidth",
	"borderLeft",
	"borderLeftColor",
	"borderLeftStyle",
	"borderLeftWidth",
	"borderRadius",
	"borderRight",
	"borderRightColor",
	"borderRightStyle",
	"borderRightWidth",
	"borderSpacing",
	"borderStyle",
	"borderTop",
	"borderTopColor",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderTopStyle",
	"borderTopWidth",
	"borderWidth",
	"bottom",
	"boxDecorationBreak",
	"boxShadow",
	"boxSizing",
	"breakAfter",
	"breakBefore",
	"breakInside",
	"captionSide",
	"caretColor",
	"clear",
	"clip",
	"clipPath",
	"color",
	"colorScheme",
	"columnCount",
	"columnFill",
	"columnGap",
	"columnRule",
	"columnRuleColor",
	"columnRuleStyle",
	"columnRuleWidth",
	"columnSpan",
	"columnWidth",
	"columns",
	"contain",
	"content",
	"cursor",
	"direction",
	"display",
	"emptyCells",
	"filter",
	"flex",
	"flexBasis",
	"flexDirection",
	"flexFlow",
	"flexGrow",
	"flexShrink",
	"flexWrap",
	"float",
	"font",
	"fontFamily",
	"fontFeatureSettings",
	"fontKerning",
	"fontSize",
	"fontSizeAdjust",
	"fontStretch",
	"fontStyle",
	"fontVariant",
	"fontVariationSettings",
	"fontWeight",
	"gap",
	"grid",
	"gridArea",
	"gridAutoColumns",
	"gridAutoFlow",
	"gridAutoRows",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnGap",
	"gridColumnStart",
	"gridGap",
	"gridRow",
	"gridRowEnd",
	"gridRowGap",
	"gridRowStart",
	"gridTemplate",
	"gridTemplateAreas",
	"gridTemplateColumns",
	"gridTemplateRows",
	"height",
	"hyphens",
	"inset",
	"insetBlock",
	"insetBlockEnd",
	"insetBlockStart",
	"insetInline",
	"insetInlineEnd",
	"insetInlineStart",
	"isolation",
	"justifyContent",
	"justifyItems",
	"justifySelf",
	"left",
	"letterSpacing",
	"lineBreak",
	"lineClamp",
	"lineHeight",
	"listStyle",
	"margin",
	"marginBlock",
	"marginBlockEnd",
	"marginBlockStart",
	"marginBottom",
	"marginInline",
	"marginInlineEnd",
	"marginInlineStart",
	"marginLeft",
	"marginRight",
	"marginTop",
	"maxBlockSize",
	"maxHeight",
	"maxInlineSize",
	"maxWidth",
	"minBlockSize",
	"minHeight",
	"minInlineSize",
	"minWidth",
	"objectFit",
	"objectPosition",
	"opacity",
	"order",
	"outline",
	"outlineColor",
	"outlineOffset",
	"outlineStyle",
	"outlineWidth",
	"overflow",
	"overflowAnchor",
	"overflowBlock",
	"overflowInline",
	"overflowWrap",
	"overflowX",
	"overflowY",
	"padding",
	"paddingBlock",
	"paddingBlockEnd",
	"paddingBlockStart",
	"paddingBottom",
	"paddingInline",
	"paddingInlineEnd",
	"paddingInlineStart",
	"paddingLeft",
	"paddingRight",
	"paddingTop",
	"placeContent",
	"placeItems",
	"placeSelf",
	"pointerEvents",
	"position",
	"resize",
	"right",
	"rotate",
	"rowGap",
	"scrollBehavior",
	"scrollMargin",
	"scrollPadding",
	"scrollSnapAlign",
	"scrollSnapType",
	"tabSize",
	"tableLayout",
	"textAlign",
	"textDecoration",
	"textDecorationColor",
	"textDecorationLine",
	"textDecorationStyle",
	"textDecorationThickness",
	"textIndent",
	"textOverflow",
	"textRendering",
	"textShadow",
	"textTransform",
	"textUnderlineOffset",
	"top",
	"transform",
	"transformOrigin",
	"transition",
	"transitionDelay",
	"transitionDuration",
	"transitionProperty",
	"transitionTimingFunction",
	"translate",
	"userSelect",
	"verticalAlign",
	"visibility",
	"whiteSpace",
	"width",
	"wordBreak",
	"wordSpacing",
	"wordWrap",
	"writingMode",
	"zIndex",
]);

function stylexNumericValue(value: StyleValue, property?: string): StyleValue {
	const numeric =
		value.kind === StyleValueKindTag.Literal && typeof value.value === "number"
			? value.value
			: value.kind === StyleValueKindTag.Dynamic
				? evaluateNumericExpression(value.expression)
				: undefined;
	if (numeric === undefined || !Number.isFinite(numeric)) return value;
	if (STYLEX_UNITLESS_PROPERTIES.has(property ?? "")) return { kind: "literal", value: numeric };
	return { kind: "literal", value: `${numeric}px` };
}

const stylexNumericLowering: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.StyleXNumericNormalization,
	apply: ({ program, target }) => {
		if (target.adapter !== CodemodAdapterId.StyleX) return { program, residuals: [], applied: [] };
		let changed = false;
		const declaration = (item: StyleProgram["declarations"][number]) => {
			const value = stylexNumericValue(item.value, item.property);
			if (value === item.value) return item;
			changed = true;
			return { ...item, value };
		};
		const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
			...item,
			declarations: item.declarations.map(declaration),
			children: item.children.map(rule),
		});
		const rules = program.rules.map(rule);
		return {
			program: changed
				? { ...program, declarations: program.declarations.map(declaration), rules }
				: program,
			residuals: [],
			applied: changed ? [StyleLoweringId.StyleXNumericNormalization] : [],
		};
	},
};

function evaluateNumericExpression(expression: string): number | undefined {
	const tokens = expression.match(/\d*\.?\d+|[()+\-*/]/g);
	if (tokens === null || tokens.join("") !== expression.replace(/\s+/g, "")) return undefined;
	let index = 0;
	const peek = (): string | undefined => tokens[index];
	const consume = (): string | undefined => tokens[index++];
	const primary = (): number | undefined => {
		if (peek() === "(") {
			consume();
			const value = additive();
			if (consume() !== ")") return undefined;
			return value;
		}
		const token = consume();
		return token === undefined ? undefined : Number(token);
	};
	const multiplicative = (): number | undefined => {
		let value = primary();
		while (value !== undefined && (peek() === "*" || peek() === "/")) {
			const operator = consume();
			const right = primary();
			if (right === undefined || (operator === "/" && right === 0)) return undefined;
			value = operator === "*" ? value * right : value / right;
		}
		return value;
	};
	const additive = (): number | undefined => {
		let value = multiplicative();
		while (value !== undefined && (peek() === "+" || peek() === "-")) {
			const operator = consume();
			const right = multiplicative();
			if (right === undefined) return undefined;
			value = operator === "+" ? value + right : value - right;
		}
		return value;
	};
	const value = additive();
	return index === tokens.length ? value : undefined;
}

function stylexConditionKey(
	condition: StyleProgram["rules"][number]["conditions"][number],
): string | undefined {
	const value = condition.value ?? condition.name;
	if (condition.kind === SemanticConditionKindTag.Pseudo) {
		const selector = value.startsWith(":") ? value : `:${value}`;
		return selector.startsWith("::") ? undefined : selector;
	}
	if (condition.kind === SemanticConditionKindTag.Selector) {
		const selector = value.startsWith("&") ? value.slice(1) : value;
		return (selector.startsWith(":") && !selector.startsWith("::")) || selector.startsWith("[")
			? selector
			: undefined;
	}
	if (condition.kind === SemanticConditionKindTag.Media)
		return value.startsWith("@media") ? value : `@media ${value}`;
	if (condition.kind === SemanticConditionKindTag.Container)
		return value.startsWith("@container") ? value : `@container ${value}`;
	if (condition.kind === SemanticConditionKindTag.Supports)
		return value.startsWith("@supports") ? value : `@supports ${value}`;
	if (condition.kind === SemanticConditionKindTag.Named && condition.name === "base") return "";
	return undefined;
}

function stylexValue(value: StyleValue): string {
	if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
	if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

interface StyleXConditionNode {
	value?: StyleValue;
	readonly children: Map<string, StyleXConditionNode>;
}

function renderStyleXConditionNode(node: StyleXConditionNode, entryDepth: number): string {
	if (node.children.size === 0) return node.value === undefined ? "null" : stylexValue(node.value);
	const indent = "\t".repeat(entryDepth);
	const closeIndent = "\t".repeat(entryDepth - 1);
	const entries = [
		`${indent}default: ${node.value === undefined ? "null" : stylexValue(node.value)},`,
		...[...node.children].map(
			([condition, child]) =>
				`${indent}${JSON.stringify(condition)}: ${renderStyleXConditionNode(child, entryDepth + 1)},`,
		),
	];
	return `{\n${entries.join("\n")}\n${closeIndent}}`;
}

function stylexConditionalProgramObject(program: StyleProgram): {
	readonly text?: string;
	readonly residuals: readonly StyleProgram["residuals"][number][];
} {
	const hasConditions = program.rules.some(
		(rule) =>
			rule.conditions.length > 0 ||
			rule.declarations.some((declaration) => declaration.conditions.length > 0),
	);
	if (!hasConditions) return { residuals: [] };
	const residuals: StyleProgram["residuals"][number][] = [];
	const addResidual = (text: string, hint: string): void => {
		if (residuals.some((residual) => residual.text === text && residual.hint === hint)) return;
		residuals.push({ kind: StyleProgramResidualKindTag.Capability, text, hint });
	};
	if (
		program.rules.some((rule) => rule.kind !== StyleRuleKindTag.Style || rule.children.length > 0)
	) {
		addResidual(
			"conditional style rules",
			"StyleX requires conditional declarations to be property-value conditions",
		);
		return { residuals };
	}
	const rules = program.rules.filter((rule) => rule.declarations.length > 0);
	const unnamedRules = rules.filter((rule) => rule.name === undefined);
	if (
		unnamedRules.length > 1 ||
		(unnamedRules.length > 0 && rules.some((rule) => rule.name === "style"))
	) {
		addResidual(
			"conditional style rules",
			"StyleX conditional output requires one unnamed style rule or named style rules",
		);
		return { residuals };
	}
	const renderedRules = rules.map((rule) => {
		const properties = new Map<string, StyleXConditionNode>();
		for (const declaration of rule.declarations) {
			if (/^-Un[A-Z]/u.test(declaration.property)) continue;
			const conditions = [...rule.conditions, ...declaration.conditions].filter(
				(condition) =>
					!(condition.kind === SemanticConditionKindTag.Named && condition.name === "base"),
			);
			let property = properties.get(declaration.property);
			if (property === undefined) {
				property = { children: new Map() };
				properties.set(declaration.property, property);
			}
			if (conditions.length === 0) {
				property.value = declaration.value;
				continue;
			}
			let current = property;
			let representable = true;
			for (const condition of conditions) {
				const key = stylexConditionKey(condition);
				if (key === undefined || key === "") {
					addResidual(
						conditions.map((item) => item.raw ?? item.name).join("__"),
						"condition is not expressible as a StyleX property-value condition",
					);
					representable = false;
					break;
				}
				let child = current.children.get(key);
				if (child === undefined) {
					child = { children: new Map() };
					current.children.set(key, child);
				}
				current = child;
			}
			if (representable) current.value = declaration.value;
		}
		const propertiesText = [...properties].flatMap(([name, property]) => {
			const propertyKey = /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
			if (property.children.size === 0)
				return [
					`\t\t${propertyKey}: ${property.value === undefined ? "null" : stylexValue(property.value)},`,
				];
			return [`\t\t${propertyKey}: ${renderStyleXConditionNode(property, 3)},`];
		});
		const name = rule.name ?? "style";
		const ruleKey = /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
		return `\t${ruleKey}: {\n${propertiesText.join("\n")}\n\t},`;
	});
	if (residuals.length > 0) return { residuals };
	const object = `stylex.create({\n${renderedRules.join("\n")}\n})`;
	return {
		text: unnamedRules.length === 1 && rules.length === 1 ? `${object}.style` : object,
		residuals: [],
	};
}

export function normalizeStyleXVariables(program: StyleProgram): StyleProgram {
	const root = program.rules[0];
	const variableProperty = (property: string): string =>
		property.startsWith("--") ? property : `--${property}`;
	return {
		...program,
		rules:
			root === undefined
				? program.rules
				: [
						{
							...root,
							kind: StyleRuleKindTag.Global,
							selector: ":root",
							declarations: root.declarations.map((declaration) => ({
								...declaration,
								property: variableProperty(declaration.property),
							})),
						},
						...program.rules.slice(1),
					],
		emissionHints: [...(program.emissionHints ?? []), StyleProgramEmissionHint.GlobalVariables],
	};
}

function normalizeStyleXConditionalNullDefaults(program: StyleProgram): StyleProgram {
	const sameCondition = (
		left: StyleProgram["rules"][number]["conditions"][number],
		right: StyleProgram["rules"][number]["conditions"][number],
	): boolean =>
		left.kind === right.kind &&
		left.name === right.name &&
		left.value === right.value &&
		left.raw === right.raw;
	const normalizeRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => {
		const declarations = rule.declarations.filter((declaration) => {
			if (
				declaration.value.kind !== StyleValueKindTag.Dynamic ||
				declaration.value.expression.trim() !== "null"
			)
				return true;
			const prefix = [...rule.conditions, ...declaration.conditions];
			return !rule.declarations.some((candidate) => {
				if (candidate === declaration || candidate.property !== declaration.property) return false;
				const conditions = [...rule.conditions, ...candidate.conditions];
				return (
					conditions.length > prefix.length &&
					prefix.every((condition, index) => {
						const candidateCondition = conditions[index];
						return candidateCondition !== undefined && sameCondition(condition, candidateCondition);
					})
				);
			});
		});
		return {
			...rule,
			declarations,
			children: rule.children.map(normalizeRule),
		};
	};
	const rules = program.rules.map(normalizeRule);
	return {
		...program,
		rules,
		declarations: rules.flatMap((rule) =>
			rule.kind === StyleRuleKindTag.Style &&
			rule.name === undefined &&
			rule.conditions.length === 0
				? rule.declarations
				: [],
		),
	};
}

export function createStyleXAdapter(options: StyleXAdapterOptions = {}) {
	return defineCodemodAdapter({
		id: CodemodAdapterId.StyleX,
		officialApi: {
			pluginSystems: ["defineVars", "createTheme", "conditionalStyles"],
			compilerIntegrations: ["@stylexjs/babel-plugin"],
		},
		patterns: [
			{
				name: CodemodPatternId.StyleXCreate,
				...stylexMethodPattern("create"),
				objectKind: "named",
				transform: normalizeStyleXConditionalNullDefaults,
			},
			{
				name: CodemodPatternId.StyleXKeyframes,
				...stylexMethodPattern("keyframes"),
				kind: CodemodCallPatternKindTag.Keyframes,
			},
			{
				name: CodemodPatternId.StyleXDefineVars,
				...stylexMethodPattern("defineVars"),
				transform: normalizeStyleXVariables,
			},
			{
				name: "stylex-create-theme",
				...stylexMethodPattern("createTheme", "\\s*\\("),
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Configuration,
					hint: "StyleX createTheme requires variable-aware theme lowering",
				},
			},
		],
		packages: CodemodAdapterKit.dependency("@stylexjs/stylex", "peer"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.StyleX, "partial", {
			"important-priority": "unsupported",
			"named-conditions": "exact",
			"named-rules": "exact",
			"dynamic-values": "partial",
			composition: "partial",
			"font-face": "unsupported",
			layers: "unsupported",
			"supports-rules": "unsupported",
			"property-rules": "unsupported",
		}),
		detectPatterns: [/@stylexjs\/stylex/, /\bstylex\.create\s*\(/],
		sourceModules: ["@stylexjs/stylex"],
		configFiles: ["package.json"],
		sourceObjectOptions: (source, context) =>
			createStyleXSourceObjectOptions(source, context, options.crossModuleResolver),
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostFrameworkConversions: [
					{
						from: BuiltinHostFramework.Solid,
						to: BuiltinHostFramework.React,
						canConvert: ({ file, source }) =>
							/\.(?:jsx|tsx)$/.test(file) &&
							!/\b(?:createSignal|createMemo|createEffect)\s*\(|\bon:|\buse:|\bclass\s*=/.test(
								source,
							),
					},
					{
						from: BuiltinHostFramework.Vue,
						to: BuiltinHostFramework.React,
						canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
						rewriteDocument: ({ code, targetFramework }) =>
							rewriteVueSfcToJsx(code, targetFramework),
					},
				],
				hostRepresentation: StyleHostRepresentationKind.Component,
				resolveHostRepresentation: ({ program, framework }) => {
					if (framework !== undefined && framework !== BuiltinHostFramework.React) return undefined;
					return program.source?.subject === undefined
						? StyleHostRepresentationKind.StyleProp
						: StyleHostRepresentationKind.Component;
				},
				rewriteHost: ({ code, emittedExpression, binding, framework, representation }) => {
					if (representation !== StyleHostRepresentationKind.StyleProp)
						return { code, residuals: [] };
					if (framework !== undefined && framework !== BuiltinHostFramework.React)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: emittedExpression,
									hint: `StyleX host projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const expression = binding ?? emittedExpression;
					const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const pattern = new RegExp(`(\\s)className\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
					if (!pattern.test(code))
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: expression,
									hint: "StyleX host projection requires an exact className binding",
								},
							],
						};
					return {
						code: code.replace(pattern, `$1{...stylex.props(${expression})}`),
						residuals: [],
					};
				},
				rewriteComponent: ({ code, binding, tag, framework, representation }) => {
					if (representation !== StyleHostRepresentationKind.StyleProp)
						return { code, residuals: [] };
					if (framework !== BuiltinHostFramework.React)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: `StyleX component projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const selfClosing = new RegExp(`<${escapedBinding}\\b([^<>]*?)/\\s*>`, "g");
					let found = false;
					const rewritten = code.replace(selfClosing, (_match, rawAttrs: string) => {
						found = true;
						const attrs = String(rawAttrs).trimEnd();
						if (/\b(?:className|style)\s*=/.test(attrs)) return _match;
						return `<${tag}${attrs} {...stylex.props(${binding})} />`;
					});
					if (!found || rewritten === code)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: "StyleX component projection requires a simple self-closing host use",
								},
							],
						};
					return { code: rewritten, residuals: [] };
				},
			},
			prepareDynamic: ({ source, file, targetId, binding }) => {
				const sourceBindings = stylexBindingsFromSource(source, file);
				const escapedBinding = binding === undefined ? undefined : escapeRegExp(binding);
				return {
					handled:
						targetId === CodemodAdapterId.Pandwind &&
						binding !== undefined &&
						(stylexMethodReferences(sourceBindings, "props").some((callee) =>
							new RegExp(
								`\\b${escapeRegExp(callee)}\\s*\\([\\s\\S]*?\\b${escapedBinding}\\s*(?:\\.|\\[)`,
							).test(source),
						) ||
							new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${escapedBinding}\\s*=`).test(source)),
				};
			},
			rewrite: ({
				source,
				code,
				file,
				targetId,
				convertedBindings,
				targetHostRepresentation,
				targetHostFramework,
				projectNamedStyleUse,
			}) => {
				// A file may contain both statically extractable groups and a small
				// runtime-only carrier. Rewrite the static consumers even when the
				// file remains partial; leaving `stylex.props(staticGroup)` in place
				// would type-check against the wrong compiled-style contract and would
				// make the static portion depend on the source runtime.
				if (targetId !== CodemodAdapterId.Pandwind) {
					const repeatedPropsResiduals = repeatedStylexPropsSpreadResiduals(
						code,
						source,
						file,
						convertedBindings,
					);
					if (repeatedPropsResiduals.length > 0)
						return {
							code: source,
							residuals: repeatedPropsResiduals,
							preserveSource: true,
						};
					let rewritten = code;
					if (
						targetHostRepresentation === StyleHostRepresentationKind.Class &&
						targetHostFramework === BuiltinHostFramework.React &&
						convertedBindings.size > 0
					)
						rewritten = rewriteStylexPropsClassHost(
							rewritten,
							stylexBindingsFromSource(source, file),
							convertedBindings,
						);
					const projected = rewriteStylexPropsNamedHosts(
						rewritten,
						source,
						file,
						convertedBindings,
						projectNamedStyleUse,
					);
					if (projected.residuals.length > 0)
						return {
							code: source,
							residuals: projected.residuals,
							preserveSource: true,
						};
					return { code: projected.code, imports: projected.imports, residuals: [] };
				}
				let rewritten = code;
				const sourceBindings = stylexBindingsFromSource(source, file);
				const cssBinding = generatedCssBinding(source);
				// StyleX permits runtime-generated selector keys such as
				// `Object.fromEntries([`:nth-child(...)`, value])`; Pandwind's
				// self-selector dialect needs the explicit `&` prefix.
				rewritten = rewritten.replace(
					/(Object\.fromEntries\(\s*\[[\s\S]*?)([`"'])(?=(?:[:.]|\u005b))/g,
					"$1$2&",
				);
				rewritten = replaceStylexCalls(rewritten, sourceBindings, "defineConsts", "(", file);
				for (const callee of stylexMethodReferences(sourceBindings, "types").map(
					(reference) => `${reference}.angle`,
				)) {
					rewritten = rewritten.replace(new RegExp(`\\b${escapeRegExp(callee)}\\s*\\(`, "g"), "(");
				}
				rewritten = rewritten.replace(
					/import\s*\{\s*type\s+StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
					"type StyleXStyles = any;",
				);
				rewritten = rewritten.replace(
					/import\s+type\s*,?\s*\{\s*StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
					"type StyleXStyles = any;",
				);
				for (const callee of stylexMethodReferences(sourceBindings, "StyleXStyles").filter(
					(reference) => reference.includes("."),
				)) {
					rewritten = rewritten.replaceAll(callee, "Record<string, string> | string");
				}
				for (const callee of stylexMethodReferences(sourceBindings, "defineMarker")) {
					rewritten = rewritten.replace(
						new RegExp(
							`(const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp(callee)}\\s*\\(\\)`,
							"g",
						),
						(_match, declaration: string, binding: string) =>
							`${declaration} ${binding} = ${JSON.stringify(`pw-marker-${binding}`)}`,
					);
				}
				for (const callee of stylexMethodReferences(sourceBindings, "defaultMarker")) {
					rewritten = rewritten.replace(
						new RegExp(`\\b${escapeRegExp(callee)}\\s*\\(\\)`, "g"),
						'"pw-default-marker"',
					);
				}
				for (const binding of convertedBindings) {
					for (const callee of stylexMethodReferences(sourceBindings, "props")) {
						rewritten = rewritten.replace(
							new RegExp(
								`\\b${escapeRegExp(callee)}\\s*\\((\\s*${escapeRegExp(binding)}(?:\\s*\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\]))`,
								"g",
							),
							`${cssBinding}.props($1`,
						);
					}
				}
				for (const callee of stylexMethodReferences(sourceBindings, "props")) {
					rewritten = rewritten.replace(
						new RegExp(`\\b${escapeRegExp(callee)}\\s*\\(`, "g"),
						`${cssBinding}.props(`,
					);
				}
				rewritten = moveStyleAfterPropsSpread(rewritten, cssBinding);
				rewritten = mergeClassNameAfterPropsSpread(rewritten, cssBinding);
				// Some StyleX host components pass `xstyle` through StyleX's runtime
				// `stylex.props` implementation. A compiled Pandwind group is static,
				// but that host port does not know how to consume its class map. Move
				// static carriers to the universal React className port at the adapter
				// boundary; leave dynamic carriers on xstyle for their residual path.
				rewritten = rewriteStaticXstyleHosts(rewritten, cssBinding);
				return {
					code: rewritten,
					imports: rewritten === code ? [] : staticImports(cssBinding),
					residuals: [],
				};
			},
		},
		lowerings: [stylexNumericLowering],
		emit(program, { programObject }, context) {
			if (
				program.source?.pattern === CodemodPatternId.StyleXKeyframes ||
				program.rules[0]?.kind === StyleRuleKindTag.Keyframes
			) {
				return {
					text: `stylex.keyframes(${programObject(program)})`,
					imports: ['import * as stylex from "@stylexjs/stylex";'],
				};
			}
			if (program.source?.pattern === CodemodPatternId.StyleXDefineVars) {
				return {
					text: `stylex.defineVars(${programObject(program)})`,
					imports: ['import * as stylex from "@stylexjs/stylex";'],
				};
			}
			const named = program.rules.some((rule) => rule.name !== undefined);
			const conditionalEmission = stylexConditionalProgramObject(program);
			const styleExpression =
				conditionalEmission.text ??
				(named
					? `stylex.create(${programObject(program)})`
					: `stylex.create({ style: ${programObject(program)} }).style`);
			const component = stylexComponentEmission(styleExpression, context);
			if (component !== undefined)
				return {
					...component,
					imports: ['import * as stylex from "@stylexjs/stylex";'],
					...(conditionalEmission.residuals.length === 0
						? {}
						: { residuals: conditionalEmission.residuals }),
				};
			if (
				context?.host?.representation === StyleHostRepresentationKind.Component &&
				context.host.subject !== undefined
			)
				return {
					text: "",
					imports: ['import * as stylex from "@stylexjs/stylex";'],
					residuals: [
						{
							kind: StyleProgramResidualKindTag.HostFramework,
							text: context.host.subject,
							hint: "StyleX could not emit the styled component as a React component",
						},
					],
				};
			return {
				// StyleX's target value is a compiled style object, not a class
				// string. Named programs keep their map; an unnamed program gets a
				// stable local `style` key so it can be consumed by stylex.props.
				text: styleExpression,
				imports: ['import * as stylex from "@stylexjs/stylex";'],
				...(conditionalEmission.residuals.length === 0
					? {}
					: { residuals: conditionalEmission.residuals }),
			};
		},
	});
}
