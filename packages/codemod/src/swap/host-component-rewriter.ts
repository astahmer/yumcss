import { SourcePass } from "../source-pass-utils.ts";
import { SourceBindings, SourceHostUseKind } from "pandwind/source";
import { StyleProgramResidualKindTag } from "./semantic-ir.ts";
import type { StyleProgram, StyleProgramResidual } from "./semantic-ir.ts";
import {
	BuiltinHostFramework,
	HOST_FRAMEWORK_REGISTRY,
	getHostFrameworkAdapter,
} from "./host-adapters.ts";
import { HostComponentRewriterId } from "./identifiers.ts";

export const HOST_COMPONENT_REWRITER_SCHEMA = "pandwind.host-component-rewriter/1" as const;

/** Canonical intrinsic host projection for source component adapters. */
export function canonicalizeSourceHost(
	program: StyleProgram,
	componentTags: Readonly<Record<string, string | undefined>>,
	adapterName: string,
): StyleProgram {
	const source = program.source;
	const openingTag = source?.hostOpenTag;
	if (source === undefined || openingTag === undefined || source.hostTag !== undefined)
		return program;
	const tag = /^<\s*([A-Za-z_$][\w$.-]*)/u.exec(openingTag)?.[1];
	if (tag === undefined) return program;
	const member = tag.slice(tag.lastIndexOf(".") + 1);
	const hasHostOverride = /\b(?:as|asChild|component|renderRoot)\s*=/u.test(openingTag);
	const hasAdapterComponent =
		Object.hasOwn(componentTags, tag) || Object.hasOwn(componentTags, member);
	const intrinsicMember = /^[a-z][\w-]*$/u.test(member) ? member : undefined;
	if (!hasAdapterComponent && !hasHostOverride)
		return intrinsicMember === undefined
			? program
			: { ...program, source: { ...source, hostTag: intrinsicMember } };
	const staticIntrinsicOverride =
		/\bas\s*=\s*(?:"([a-z][\w-]*)"|'([a-z][\w-]*)'|\{\s*["']([a-z][\w-]*)["']\s*\})/u.exec(
			openingTag,
		);
	const hostTag = hasHostOverride
		? (staticIntrinsicOverride?.[1] ?? staticIntrinsicOverride?.[2] ?? staticIntrinsicOverride?.[3])
		: Object.hasOwn(componentTags, tag)
			? componentTags[tag]
			: (componentTags[member] ?? intrinsicMember);
	if (hostTag !== undefined)
		return {
			...program,
			source: {
				...source,
				hostTag,
				...(staticIntrinsicOverride === null
					? {}
					: {
							hostStyleAttributes: [
								...(source.hostStyleAttributes ?? []),
								staticIntrinsicOverride[0],
							],
						}),
			},
		};
	return {
		...program,
		residuals: [
			...program.residuals,
			{
				kind: StyleProgramResidualKindTag.Component,
				text: tag,
				hint: `${adapterName} host '${tag}' has no verified intrinsic projection`,
			},
		],
	};
}

export function canonicalSourceHostClosingEdit(
	sourceText: string,
	file: string,
	program: StyleProgram,
): { readonly start: number; readonly end: number; readonly text: string } | undefined {
	const source = program.source;
	const openingTag = source?.hostOpenTag;
	const hostTag = source?.hostTag;
	if (source === undefined || openingTag === undefined || hostTag === undefined) return undefined;
	const sourceTag = /^<\s*([A-Za-z_$][\w$.-]*)/u.exec(openingTag)?.[1];
	if (sourceTag === undefined || sourceTag === hostTag || source.start === undefined)
		return undefined;
	try {
		const closing = SourceBindings.fromDocument({ file, source: sourceText }).hostUses.find(
			(use) => use.start === source.start,
		)?.closing;
		return closing === undefined
			? undefined
			: { start: closing.start, end: closing.end, text: `</${hostTag}>` };
	} catch {
		return undefined;
	}
}

export interface HostComponentRewriteRequest {
	readonly source: string;
	/** Source filename used to select parser-backed excluded ranges. */
	readonly file?: string;
	readonly binding: string;
	readonly tag: string;
	readonly framework: string;
	readonly classExpression: string;
	/** Optional inline style carrier for runtime-valued component declarations. */
	readonly styleExpression?: string;
	/** Source component attributes projected by the owning target adapter. */
	readonly attrsExpression?: string;
	/** The class expression is actually a complete component value from the target emitter. */
	readonly componentExpression?: boolean;
}

export interface HostComponentRewriteResult {
	readonly code: string;
	readonly changed: boolean;
	readonly needsCx: boolean;
	/** Import statements required by a framework-specific declaration projection. */
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface StandaloneHostComponentRewriteRequest {
	readonly source: string;
	readonly tag: string;
	readonly framework: string;
	/** Expression that evaluates to the generated Pandwind class string. */
	readonly classExpression: string;
}

const isPandwindCarrier = (expression: string): boolean =>
	/^css\.(?:class|vars)\(/u.test(expression.trim());

const mergeClassExpression = (
	generated: string,
	existing: string,
): { readonly expression: string; readonly needsCx: boolean } =>
	isPandwindCarrier(generated)
		? { expression: `css.props(${generated}, ${existing}).className`, needsCx: false }
		: { expression: `cx(${generated}, ${existing})`, needsCx: true };

export interface HostComponentRewriter {
	readonly schema: typeof HOST_COMPONENT_REWRITER_SCHEMA;
	readonly id: string;
	readonly frameworks: readonly string[];
	rewrite(request: HostComponentRewriteRequest): HostComponentRewriteResult;
	/** Wrap a converted style binding when it is itself used as a styled subject. */
	rewriteDeclaration?(request: HostComponentRewriteRequest): HostComponentRewriteResult;
	/** Wrap an exported styled intrinsic that has no component binding or JSX use. */
	rewriteStandalone?(request: StandaloneHostComponentRewriteRequest): HostComponentRewriteResult;
}

export interface HostDynamicCarrierRewriteResult {
	readonly code: string;
	readonly changed: boolean;
	readonly needsCx: boolean;
	readonly residuals: readonly StyleProgramResidual[];
}

export function intrinsicTagForSubject(subject: string): string | undefined {
	const suffix = "(?:\\.props\\([\\s\\S]*\\)|\\.attrs\\([\\s\\S]*\\))?";
	const member = new RegExp(`^styled\\.([A-Za-z_$][\\w$]*)${suffix}$`, "u").exec(subject)?.[1];
	if (member !== undefined && /^[a-z][\w-]*$/.test(member)) return member;
	const call = new RegExp(`^styled\\(\\s*["']([a-z][\\w-]*)["']\\s*\\)${suffix}$`, "u").exec(
		subject,
	)?.[1];
	return call;
}

/** Component expression used by `styled(Component)` subjects. */
export function componentTagForSubject(subject: string): string | undefined {
	return (
		intrinsicTagForSubject(subject) ??
		/^styled\(\s*([A-Za-z_$][\w$]*)\s*\)(?:\.attrs\([\s\S]*\))?$/.exec(subject)?.[1]
	);
}

/** Return the authored component expression for a non-intrinsic styled subject. */
export function componentExpressionForSubject(subject: string): string | undefined {
	return /^styled\(\s*([A-Za-z_$][\w$]*)\s*\)(?:\.attrs\([\s\S]*\))?$/.exec(subject)?.[1];
}

/**
 * Return a static `.attrs(...)` payload when it is safe to forward it as a
 * component attribute object. Dynamic attrs remain owned by the host adapter,
 * which can evaluate them with the correct props/theme context.
 */
export function componentAttrsExpressionForSubject(subject: string): string | undefined {
	const match = /\.attrs\(\s*([\s\S]*)\s*\)$/.exec(subject);
	if (match === null) return undefined;
	const expression = match[1]?.trim();
	return expression === undefined || expression === "" ? undefined : expression;
}

export function componentAttrsValueExpression(
	expression: string | undefined,
	propsParameter = "props",
): string | undefined {
	if (expression === undefined) return "{}";
	const attrsExpression = expression.trim();
	if (/^(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^function\b/u.test(attrsExpression))
		return `(${attrsExpression})(${propsParameter})`;
	if (
		attrsExpression.startsWith("{") &&
		SourcePass.matchBlock(attrsExpression, 0)?.end === attrsExpression.length
	)
		return `(${attrsExpression})`;
	return undefined;
}

export function wrapComponentExpressionWithAttrs(
	expression: string,
	attrsExpression: string | undefined,
	framework: string | undefined,
): {
	readonly text: string;
	readonly imports: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
} {
	if (attrsExpression === undefined) return { text: expression, imports: [], residuals: [] };
	if (framework !== BuiltinHostFramework.React && framework !== BuiltinHostFramework.Preact)
		return {
			text: "",
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: attrsExpression,
					hint: `styled component attrs projection requires a React or Preact host, got ${framework ?? "unknown"}`,
				},
			],
		};
	const attrsValue = componentAttrsValueExpression(attrsExpression);
	if (attrsValue === undefined)
		return {
			text: "",
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: attrsExpression,
					hint: "styled component attrs must be a static object or a props callback to preserve them",
				},
			],
		};
	const moduleName = framework === BuiltinHostFramework.Preact ? "preact/compat" : "react";
	const createElement = "__pandwindCreateElement";
	const forwardRef = "__pandwindForwardRef";
	return {
		text: `((Component) => ${forwardRef}((props, ref) => { const attrs = ${attrsValue}; const { as: _attrsAs, ...attrsProps } = attrs; const { as: _propsAs, ...rest } = props; return ${createElement}(Component, { ...rest, ...attrsProps, ...(props.as === undefined && attrs.as === undefined ? {} : { as: attrs.as ?? props.as }), className: [props.className, attrs.className].filter(Boolean).join(" ") || undefined, style: { ...props.style, ...attrs.style }, ref }); }))(${expression})`,
		imports: [
			`import { createElement as ${createElement}, forwardRef as ${forwardRef} } from "${moduleName}";`,
		],
		residuals: [],
	};
}

/** Return the static `.props({...})` payload when a styled subject exposes one. */
export function componentPropsExpressionForSubject(subject: string): string | undefined {
	const match = /\.props\(\s*([\s\S]*)\s*\)$/.exec(subject);
	if (match === null) return undefined;
	const expression = match[1]?.trim();
	return expression === undefined || expression === "" ? undefined : expression;
}

/**
 * Return top-level keys consumed by a literal `.props({...})` payload. Dynamic
 * payloads stay unfiltered because their key set cannot be proven here.
 */
export function componentPropNamesForSubject(subject: string): readonly string[] | undefined {
	const expression = componentPropsExpressionForSubject(subject);
	if (expression === undefined || !expression.startsWith("{")) return undefined;
	const block = SourcePass.matchBlock(expression, 0);
	if (block === null || expression.slice(block.end).trim() !== "") return undefined;
	const names: string[] = [];
	let cursor = 0;
	while (cursor < block.body.length) {
		while (/[\s,]/u.test(block.body[cursor] ?? "")) cursor++;
		if (cursor >= block.body.length) break;
		if (block.body.startsWith("...", cursor)) {
			const spreadEnd = block.body.indexOf(",", cursor);
			cursor = spreadEnd === -1 ? block.body.length : spreadEnd + 1;
			continue;
		}
		const key = /^(?:([A-Za-z_$][\w$]*)|(["'])(.*?)\2)/u.exec(block.body.slice(cursor));
		if (key === null) return undefined;
		const name = key[1] ?? key[3];
		if (name === undefined) return undefined;
		cursor += key[0].length;
		while (/\s/u.test(block.body[cursor] ?? "")) cursor++;
		if (block.body[cursor] === ":") {
			cursor++;
			let braces = 0;
			let brackets = 0;
			let parentheses = 0;
			let quote: string | undefined;
			for (; cursor < block.body.length; cursor++) {
				const character = block.body[cursor]!;
				if (quote !== undefined) {
					if (character === quote && block.body[cursor - 1] !== "\\") quote = undefined;
					continue;
				}
				if (character === '"' || character === "'" || character === "`") {
					quote = character;
					continue;
				}
				if (character === "{") braces++;
				else if (character === "}") braces--;
				else if (character === "[") brackets++;
				else if (character === "]") brackets--;
				else if (character === "(") parentheses++;
				else if (character === ")") parentheses--;
				else if (character === "," && braces === 0 && brackets === 0 && parentheses === 0) {
					break;
				}
			}
		} else if (block.body[cursor] !== "," && cursor < block.body.length) {
			return undefined;
		}
		names.push(name);
	}
	return names;
}

/** Preserve a styled subject and its source-owned `.attrs(...)` chain. */
export function styledSubjectFromFunctionMatch(match: string): string | undefined {
	const subject =
		/^(styled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?)(\s*\.attrs\s*\([\s\S]*?\))?(?=\s*(?:\(|`))/u.exec(
			match.trim(),
		);
	if (subject?.[1] === undefined) return undefined;
	const base = subject[1].replace(/\s+/gu, " ").replace(/\.\s+/gu, ".");
	const attrs = subject[2]?.replace(/^\s*\.\s*attrs\s*/u, ".attrs");
	return `${base}${attrs ?? ""}`;
}

/**
 * A static styled subject used only as an expression statement has no
 * component value for a target to preserve. It is safe to lower its style
 * carrier in place; assignments, returns, calls, exports, and host uses must
 * continue through the component contract instead.
 */
export function isDiscardedExpressionStatement(
	source: string,
	start: number,
	end: number,
): boolean {
	const before = source.slice(0, start).trimEnd();
	const after = source.slice(end).trimStart();
	if (/\bexport\s+default$/.test(before)) return false;
	return (before === "" || /[;{}]$/.test(before)) && (after === "" || /^[;}]/.test(after));
}

const excluded = (source: string, file: string, index: number): boolean => {
	try {
		return SourcePass.computeExcludedRanges(source, file).isExcluded(index);
	} catch {
		return false;
	}
};

/** Find an opening/closing tag boundary without stopping at `>` in JSX expressions. */
function findTagEnd(source: string, start: number): number | undefined {
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
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

interface TagMatch {
	readonly start: number;
	readonly end: number;
	readonly text: string;
	readonly closing: boolean;
}

function tagMatches(source: string, binding: string): TagMatch[] {
	const pattern = new RegExp(`<\\/?\\s*${binding}\\b`, "g");
	const matches: TagMatch[] = [];
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		const end = findTagEnd(source, start) ?? source.indexOf(">", start);
		if (end === undefined) continue;
		if (end < 0) continue;
		matches.push({
			start,
			end: end + 1,
			text: source.slice(start, end + 1),
			closing: match[0]!.startsWith("</"),
		});
	}
	return matches;
}

/**
 * Resolve JSX hosts from the shared source index. The ranges are owned by the
 * parser, so braces, strings, comments, nested elements, and closing tags are
 * never rediscovered by a second regex parser.
 */
function scannedTagMatches(source: string, file: string, binding: string): TagMatch[] | undefined {
	try {
		const index = SourceBindings.fromDocument({ file, source });
		const uses = index.hostUses.filter(
			(use) =>
				use.kind === SourceHostUseKind.Component &&
				use.localName === binding &&
				!index.isShadowedAt(binding, use.start),
		);
		return uses.flatMap((use) => [
			{
				start: use.start,
				end: use.end,
				text: source.slice(use.start, use.end),
				closing: false,
			},
			...(use.closing === undefined
				? []
				: [
						{
							start: use.closing.start,
							end: use.closing.end,
							text: source.slice(use.closing.start, use.closing.end),
							closing: true,
						},
					]),
		]);
	} catch {
		// Vue/Svelte snippets without a parseable script island still use the
		// bounded template matcher below. TypeScript/JSX callers fail closed.
		return undefined;
	}
}

function openingTagHasAttributeOrSpread(text: string, attribute: string): boolean {
	const opening = /^<\s*[A-Za-z_$][\w$.-]*/u.exec(text);
	if (opening === null) return false;
	let cursor = opening[0].length;
	while (cursor < text.length) {
		while (/\s/u.test(text[cursor] ?? "")) cursor++;
		if (text[cursor] === ">" || text[cursor] === "/") return false;
		if (text[cursor] === "{") {
			const block = SourcePass.matchBlock(text, cursor);
			if (block === null || block.body.trim().startsWith("...")) return true;
			cursor = block.end;
			continue;
		}
		const name = /^[A-Za-z_$][\w$:-]*/u.exec(text.slice(cursor))?.[0];
		if (name === undefined) return false;
		if (name === attribute) return true;
		cursor += name.length;
		while (/\s/u.test(text[cursor] ?? "")) cursor++;
		if (text[cursor] !== "=") continue;
		cursor++;
		while (/\s/u.test(text[cursor] ?? "")) cursor++;
		if (text[cursor] === "{") {
			const block = SourcePass.matchBlock(text, cursor);
			if (block === null) return true;
			cursor = block.end;
			continue;
		}
		const quote = text[cursor];
		if (quote === "'" || quote === '"' || quote === "`") {
			cursor++;
			while (cursor < text.length) {
				if (text[cursor] === quote && text[cursor - 1] !== "\\") break;
				cursor++;
			}
			cursor++;
			continue;
		}
		while (cursor < text.length && !/[\s>]/u.test(text[cursor] ?? "")) cursor++;
	}
	return false;
}

/** Detect explicit polymorphic host props on a component binding's JSX uses. */
export function hasComponentAttributeUse(request: {
	readonly source: string;
	readonly binding: string;
	readonly attribute: string;
	readonly file?: string;
}): boolean {
	const tags = scannedTagMatches(request.source, request.file ?? "component.tsx", request.binding);
	return (
		tags?.some(
			(tag) => !tag.closing && openingTagHasAttributeOrSpread(tag.text, request.attribute),
		) ?? false
	);
}

function hostTagMatches(request: HostComponentRewriteRequest): TagMatch[] {
	const file = request.file ?? "pandwind-component.tsx";
	const scanned = scannedTagMatches(request.source, file, request.binding);
	if (scanned !== undefined) return scanned;
	if (/\.(?:tsx?|jsx?|mdx)$/iu.test(file)) return [];
	return tagMatches(request.source, request.binding);
}

function rewriteJsx(request: HostComponentRewriteRequest): HostComponentRewriteResult {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let needsCx = false;
	let found = false;
	const mask = SourcePass.computeExcludedRanges(
		request.source,
		request.file ?? "pandwind-component.tsx",
	);
	const tag = request.tag;
	const binding = request.binding;
	for (const match of hostTagMatches(request)) {
		const start = match.start;
		if (mask.isExcluded(start)) continue;
		const text = match.text;
		if (match.closing) {
			edits.push({ start, end: match.end, text: `</${tag}>` });
			found = true;
			continue;
		}
		let attrs = text.slice(1 + binding.length, -1);
		const selfClosing = /\/\s*$/.test(attrs);
		attrs = attrs.replace(/\/\s*$/, "").trimEnd();
		const classExpression = request.classExpression;
		const styleExpression = request.styleExpression;
		const dynamicClass = /\bclassName\s*=\s*\{([^{}]*)\}/.exec(attrs);
		const staticClass = /\bclassName\s*=\s*"([^"]*)"/.exec(attrs);
		if (dynamicClass !== null) {
			const merged = mergeClassExpression(classExpression, dynamicClass[1]!);
			needsCx ||= merged.needsCx;
			attrs = attrs.replace(dynamicClass[0], `className={${merged.expression}}`);
		} else if (staticClass !== null) {
			const merged = mergeClassExpression(classExpression, JSON.stringify(staticClass[1]!.trim()));
			needsCx ||= merged.needsCx;
			attrs = attrs.replace(staticClass[0], `className={${merged.expression}}`);
		} else if (/\bclassName\s*=/.test(attrs)) {
			continue;
		} else {
			attrs += ` className={${classExpression}}`;
		}
		if (styleExpression !== undefined) {
			if (!/\bstyle\s*=/.test(attrs)) attrs += ` style={${styleExpression}}`;
		}
		edits.push({
			start,
			end: match.end,
			text: `<${tag}${attrs}${selfClosing ? " /" : ""}>`,
		});
		found = true;
	}
	if (!found)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.binding,
					hint: `no rewritable ${request.binding} JSX usage found`,
				},
			],
		};
	let code = request.source;
	for (const edit of edits.toSorted((a, b) => b.start - a.start))
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return { code, changed: code !== request.source, needsCx, residuals: [] };
}

function rewriteJsxDeclaration(request: HostComponentRewriteRequest): HostComponentRewriteResult {
	const escapedBinding = request.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedExpression = request.classExpression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(
		`\\b(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*${escapedExpression}\\s*;`,
	);
	const match = assignment.exec(request.source);
	if (match === null) {
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.binding,
					hint: `converted ${request.binding} declaration could not be wrapped`,
				},
			],
		};
	}
	if (request.componentExpression === true)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [],
		};
	const classAttribute = getHostFrameworkAdapter(request.framework)?.classAttribute ?? "className";
	const attrsExpression = request.attrsExpression?.trim();
	const attrsValueExpression = componentAttrsValueExpression(attrsExpression);
	if (
		attrsExpression !== undefined &&
		request.framework !== BuiltinHostFramework.React &&
		request.framework !== BuiltinHostFramework.Preact
	)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: attrsExpression,
					hint: `styled component attrs projection requires a React host, got ${request.framework}`,
				},
			],
		};
	if (attrsExpression !== undefined && attrsValueExpression === undefined)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: attrsExpression,
					hint: "styled component attrs must be a static object or a props callback to preserve them",
				},
			],
		};
	const attrsSetup =
		attrsExpression === undefined
			? ""
			: `const attrs = ${attrsValueExpression}; const { as: _attrsAs, ...attrsProps } = attrs; `;
	const componentExpression =
		attrsExpression === undefined
			? `props.as ?? ${JSON.stringify(request.tag)}`
			: `attrs.as ?? props.as ?? ${JSON.stringify(request.tag)}`;
	const classInputs =
		attrsExpression === undefined
			? `props.${classAttribute}`
			: `cx(attrs.${classAttribute}, props.${classAttribute})`;
	const mergedClass = mergeClassExpression(request.classExpression, classInputs);
	const attrsStyle =
		attrsExpression === undefined
			? ""
			: ` style={{ ${request.styleExpression === undefined ? "" : `...${request.styleExpression}, `}...props.style, ...attrs.style }}`;
	const declaration =
		request.framework === BuiltinHostFramework.React ||
		request.framework === BuiltinHostFramework.Preact
			? `${request.binding} = (props) => { ${attrsSetup}const Component = ${componentExpression}; const { as: _as, ...rest } = props; return <Component {...rest} ${attrsExpression === undefined ? "" : "{...attrsProps} "}${classAttribute}={${mergedClass.expression}}${attrsStyle} />; };`
			: `${request.binding} = (props) => <${request.tag} ${attrsExpression === undefined ? "" : `{...(${attrsExpression})} `}{...props} ${classAttribute}={${mergedClass.expression}} />;`;
	const declarationWithStyle =
		request.styleExpression === undefined || attrsExpression !== undefined
			? declaration
			: declaration.replace(
					request.framework === BuiltinHostFramework.React ||
						request.framework === BuiltinHostFramework.Preact
						? " />; };"
						: " />;",
					` style={{ ...${request.styleExpression}, ...props.style }} />;${request.framework === BuiltinHostFramework.React || request.framework === BuiltinHostFramework.Preact ? " };" : ""}`,
				);
	return {
		code:
			request.source.slice(0, match.index + match[0].indexOf(request.binding)) +
			declarationWithStyle +
			request.source.slice(
				match.index +
					match[0].indexOf(request.binding) +
					match[0].length -
					match[0].indexOf(request.binding),
			),
		changed: true,
		needsCx: mergedClass.needsCx,
		residuals: [],
	};
}

function rewriteTemplate(request: HostComponentRewriteRequest): HostComponentRewriteResult {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let found = false;
	const tag = request.tag;
	const binding = request.binding;
	for (const match of tagMatches(request.source, binding)) {
		const start = match.start;
		if (excluded(request.source, request.file ?? "pandwind-component.vue", start)) continue;
		const text = match.text;
		if (new RegExp(`<\\/\\s*${binding}\\b`).test(text)) {
			edits.push({ start, end: match.end, text: `</${tag}>` });
			found = true;
			continue;
		}
		const selfClosing = /\/\s*>$/.test(text);
		let attrs = text
			.slice(1 + binding.length, -1)
			.replace(/\/\s*$/, "")
			.trimEnd();
		if (request.framework === BuiltinHostFramework.Vue) {
			const dynamic = /:class\s*=\s*"([^"]*)"/.exec(attrs);
			const staticClass = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
			if (dynamic !== null)
				attrs = attrs.replace(dynamic[0], `:class="[${request.classExpression}, ${dynamic[1]}]"`);
			else if (staticClass !== null)
				attrs = attrs.replace(
					staticClass[0],
					`:class="[${request.classExpression}, ${JSON.stringify(staticClass[1]!.trim())}]"`,
				);
			else attrs += ` :class="${request.classExpression}"`;
			if (request.styleExpression !== undefined) {
				if (/:style\s*=/.test(attrs)) continue;
				attrs += ` :style="${request.styleExpression}"`;
			}
		} else {
			if (/\bclass\s*=\s*\{/.test(attrs)) continue;
			attrs += ` class={${request.classExpression}}`;
			if (request.styleExpression !== undefined) {
				if (/\bstyle\s*=/.test(attrs)) continue;
				attrs += ` style={${request.styleExpression}}`;
			}
		}
		edits.push({ start, end: match.end, text: `<${tag}${attrs}${selfClosing ? " />" : ">"}` });
		found = true;
	}
	if (!found)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.binding,
					hint: `no rewritable ${request.binding} template usage found`,
				},
			],
		};
	let code = request.source;
	for (const edit of edits.toSorted((a, b) => b.start - a.start))
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return { code, changed: code !== request.source, needsCx: false, residuals: [] };
}

function rewriteVueDeclaration(request: HostComponentRewriteRequest): HostComponentRewriteResult {
	const escapedBinding = request.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedExpression = request.classExpression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(
		`\\b(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*${escapedExpression}\\s*;`,
	);
	const match = assignment.exec(request.source);
	if (match === null)
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.binding,
					hint: `converted ${request.binding} declaration could not be wrapped`,
				},
			],
		};
	const declaration =
		`${request.binding} = defineComponent((props, { attrs, slots }) => () => ` +
		`h(${JSON.stringify(request.tag)}, { ...props, ...attrs, class: [attrs.class, ${request.classExpression}] }, slots.default?.()));`;
	return {
		code:
			request.source.slice(0, match.index + match[0].indexOf(request.binding)) +
			declaration +
			request.source.slice(
				match.index +
					match[0].indexOf(request.binding) +
					match[0].length -
					match[0].indexOf(request.binding),
			),
		changed: true,
		needsCx: false,
		imports: ['import { defineComponent, h } from "vue";'],
		residuals: [],
	};
}

function rewriteStandaloneJsx(
	request: StandaloneHostComponentRewriteRequest,
): HostComponentRewriteResult {
	const exportPattern = /export\s+default\s+/g;
	const exportMatch = exportPattern.exec(request.source);
	if (exportMatch === null) {
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.tag,
					hint: "standalone styled subject has no default export to wrap",
				},
			],
		};
	}
	const expressionStart = exportMatch.index + exportMatch[0].length;
	const expression = request.source.slice(expressionStart).match(/^[\s\S]*?;/)?.[0];
	if (expression === undefined || expression.trim() !== `${request.classExpression};`) {
		return {
			code: request.source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: "host-framework",
					text: request.tag,
					hint: "standalone styled subject could not be matched after emission",
				},
			],
		};
	}
	const className = "__pandwindStandaloneClass";
	const componentName = "__pandwindStandaloneComponent";
	const classAttribute = getHostFrameworkAdapter(request.framework)?.classAttribute ?? "className";
	const mergedClass = mergeClassExpression(className, `props.${classAttribute}`);
	const replacement =
		`const ${className} = ${request.classExpression};\n` +
		`const ${componentName} = (props) => <${request.tag} {...props} ` +
		`${classAttribute}={${isPandwindCarrier(request.classExpression) ? `css.props(${className}, props.${classAttribute}).className` : mergedClass.expression}} />;\n` +
		`export default ${componentName};`;
	const end = expressionStart + expression.length;
	return {
		code: request.source.slice(0, exportMatch.index) + replacement + request.source.slice(end),
		changed: true,
		needsCx: isPandwindCarrier(request.classExpression) ? false : mergedClass.needsCx,
		residuals: [],
	};
}

export function rewriteDynamicCarrier(
	source: string,
	binding: string,
	framework: string,
	file = "pandwind-dynamic.tsx",
): HostDynamicCarrierRewriteResult {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let found = false;
	let needsCx = false;
	const jsx = getHostFrameworkAdapter(framework)?.syntax === "jsx";
	const vue = getHostFrameworkAdapter(framework)?.id === BuiltinHostFramework.Vue;
	const pattern = jsx
		? /\b(className|class)\s*=\s*\{([^{}]*)\}/g
		: vue
			? /:(class|style)\s*=\s*"([^"]*)"/g
			: /\bclass\s*=\s*\{([^{}]*)\}/g;
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (excluded(source, file, start)) continue;
		const attribute = jsx ? match[1] : vue ? `:${match[1]}` : "class";
		const expression = jsx ? match[2] : vue ? match[2] : match[1];
		if (expression?.trim() !== binding) continue;
		if (attribute === "style" || attribute === ":style") continue;
		const classAttribute = vue ? ":class" : attribute;
		const classValue = vue ? `:class="${binding}.class"` : `${classAttribute}={${binding}.class}`;
		edits.push({ start, end: start + match[0].length, text: classValue });
		const tagEnd = findTagEnd(source, source.lastIndexOf("<", start));
		if (tagEnd !== undefined) {
			const tagStart = source.lastIndexOf("<", start);
			const tag = source.slice(tagStart, tagEnd);
			const styleAttribute = vue ? ` :style="${binding}.style"` : ` style={${binding}.style}`;
			if (!new RegExp(`(?:^|\\s)(?::?style)\\s*=`).test(tag)) {
				const slash = /\/\s*$/.test(tag) ? tagEnd - tag.match(/\/\s*$/)![0].length : tagEnd;
				edits.push({ start: slash, end: slash, text: styleAttribute });
			}
		}
		found = true;
		if (jsx && expression !== binding) needsCx = true;
	}
	if (!found)
		return {
			code: source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.DynamicValues,
					text: binding,
					hint: `dynamic style binding '${binding}' has no supported host use`,
				},
			],
		};
	let code = source;
	for (const edit of edits.toSorted((a, b) => b.start - a.start))
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return { code, changed: code !== source, needsCx, residuals: [] };
}

/** Rewrite an inline dynamic expression such as `class={css`...`}`. */
export function rewriteDynamicExpressionCarrier(
	source: string,
	expression: string,
	framework: string,
	file = "pandwind-dynamic.tsx",
): HostDynamicCarrierRewriteResult {
	const escapedExpression = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (
		new RegExp(
			`\\b(?:className|class)\\s*=\\s*\\{\\s*${escapedExpression}\\.class\\s*\\}`,
			"u",
		).test(source)
	)
		return { code: source, changed: false, needsCx: false, residuals: [] };
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const jsx = getHostFrameworkAdapter(framework)?.syntax === "jsx";
	const vue = getHostFrameworkAdapter(framework)?.id === BuiltinHostFramework.Vue;
	const attributes = jsx
		? [`className={${expression}}`, `class={${expression}}`]
		: vue
			? [`:class="${expression}"`]
			: [`class={${expression}}`];
	for (const attribute of attributes) {
		let cursor = 0;
		while (true) {
			const start = source.indexOf(attribute, cursor);
			if (start === -1) break;
			cursor = start + attribute.length;
			if (excluded(source, file, start)) continue;
			const tagStart = source.lastIndexOf("<", start);
			const tagEnd = findTagEnd(source, tagStart);
			if (tagStart === -1 || tagEnd === undefined || tagEnd < start) continue;
			if (/^<\s*\//.test(source.slice(tagStart, tagStart + 4))) continue;
			const classValue = jsx
				? `${attribute.startsWith("className") ? "className" : "class"}={${expression}.class}`
				: vue
					? `:class="${expression}.class"`
					: `class={${expression}.class}`;
			edits.push({ start, end: start + attribute.length, text: classValue });
			if (!/(?:^|\s)(?::?style)\s*=/.test(source.slice(tagStart, tagEnd + 1))) {
				const styleAttribute = vue
					? ` :style="${expression}.style"`
					: ` style={${expression}.style}`;
				const insertion = /\/\s*$/.test(source.slice(tagStart, tagEnd))
					? tagEnd - source.slice(tagStart, tagEnd).match(/\/\s*$/)![0].length
					: tagEnd;
				edits.push({ start: insertion, end: insertion, text: styleAttribute });
			}
		}
	}
	if (edits.length === 0)
		return {
			code: source,
			changed: false,
			needsCx: false,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.DynamicValues,
					text: expression,
					hint: "inline dynamic style expression has no supported host use",
				},
			],
		};
	let code = source;
	for (const edit of edits.toSorted((a, b) => b.start - a.start))
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return { code, changed: code !== source, needsCx: false, residuals: [] };
}

const rewriters: readonly HostComponentRewriter[] = [
	{
		schema: HOST_COMPONENT_REWRITER_SCHEMA,
		id: HostComponentRewriterId.JsxIntrinsicComponent,
		frameworks: HOST_FRAMEWORK_REGISTRY.adapters
			.filter((adapter) => adapter.syntax === "jsx")
			.map((adapter) => adapter.id),
		rewrite: rewriteJsx,
		rewriteDeclaration: rewriteJsxDeclaration,
		rewriteStandalone: rewriteStandaloneJsx,
	},
	{
		schema: HOST_COMPONENT_REWRITER_SCHEMA,
		id: HostComponentRewriterId.TemplateIntrinsicComponent,
		frameworks: HOST_FRAMEWORK_REGISTRY.adapters
			.filter((adapter) => adapter.syntax === "template")
			.map((adapter) => adapter.id),
		rewrite: rewriteTemplate,
		rewriteDeclaration: rewriteVueDeclaration,
	},
];

export function getHostComponentRewriter(framework: string): HostComponentRewriter | undefined {
	return rewriters.find((rewriter) => rewriter.frameworks.includes(framework));
}
