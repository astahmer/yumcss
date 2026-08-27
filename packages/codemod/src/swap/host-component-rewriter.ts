import { computeExcludedRanges } from "../sources.ts";
import type { StyleProgramResidual } from "./semantic-ir.ts";
import { HOST_FRAMEWORK_REGISTRY, getHostFrameworkAdapter } from "./host-adapters.ts";

export const HOST_COMPONENT_REWRITER_SCHEMA = "pandwind.host-component-rewriter/1" as const;

export interface HostComponentRewriteRequest {
	readonly source: string;
	readonly binding: string;
	readonly tag: string;
	readonly framework: string;
	readonly classExpression: string;
	/** Optional inline style carrier for runtime-valued component declarations. */
	readonly styleExpression?: string;
}

export interface HostComponentRewriteResult {
	readonly code: string;
	readonly changed: boolean;
	readonly needsCx: boolean;
	readonly residuals: readonly StyleProgramResidual[];
}

export interface StandaloneHostComponentRewriteRequest {
	readonly source: string;
	readonly tag: string;
	readonly framework: string;
	/** Expression that evaluates to the generated Pandwind class string. */
	readonly classExpression: string;
}

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
	const member = /^styled\.([A-Za-z_$][\w$]*)$/.exec(subject)?.[1];
	if (member !== undefined && /^[a-z][\w-]*$/.test(member)) return member;
	const call = /^styled\(\s*["']([a-z][\w-]*)["']\s*\)$/.exec(subject)?.[1];
	return call;
}

/** Component expression used by `styled(Component)` subjects. */
export function componentTagForSubject(subject: string): string | undefined {
	return (
		intrinsicTagForSubject(subject) ?? /^styled\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(subject)?.[1]
	);
}

const excluded = (source: string, file: string, index: number): boolean => {
	try {
		return computeExcludedRanges(source, file).isExcluded(index);
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

function tagMatches(
	source: string,
	binding: string,
): Array<{ start: number; end: number; text: string }> {
	const pattern = new RegExp(`<\\/?\\s*${binding}\\b`, "g");
	const matches: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		const end = findTagEnd(source, start);
		if (end === undefined) continue;
		matches.push({ start, end: end + 1, text: source.slice(start, end + 1) });
	}
	return matches;
}

function rewriteJsx(request: HostComponentRewriteRequest): HostComponentRewriteResult {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let needsCx = false;
	let found = false;
	const tag = request.tag;
	const binding = request.binding;
	for (const match of tagMatches(request.source, binding)) {
		const start = match.start;
		if (excluded(request.source, "pandwind-component.tsx", start)) continue;
		const text = match.text;
		if (new RegExp(`<\\/\\s*${binding}\\b`).test(text)) {
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
			needsCx = true;
			attrs = attrs.replace(
				dynamicClass[0],
				`className={cx(${classExpression}, ${dynamicClass[1]})}`,
			);
		} else if (staticClass !== null) {
			needsCx = true;
			attrs = attrs.replace(
				staticClass[0],
				`className={cx(${classExpression}, ${JSON.stringify(staticClass[1]!.trim())})}`,
			);
		} else if (/\bclassName\s*=/.test(attrs)) {
			continue;
		} else {
			attrs += ` className={${classExpression}}`;
		}
		if (styleExpression !== undefined) {
			if (/\bstyle\s*=/.test(attrs)) continue;
			attrs += ` style={${styleExpression}}`;
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
	const assignment = `${request.binding} = ${request.classExpression};`;
	const start = request.source.indexOf(assignment);
	if (start === -1) {
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
	const classAttribute = request.framework === "solid" ? "class" : "className";
	const declaration =
		`const ${request.binding} = (props) => <${request.tag} {...props} ` +
		`${classAttribute}={cx(${request.classExpression}, props.${classAttribute})} />;`;
	return {
		code:
			request.source.slice(0, start) +
			declaration +
			request.source.slice(start + assignment.length),
		changed: true,
		needsCx: true,
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
		if (excluded(request.source, "pandwind-component.vue", start)) continue;
		const text = match.text;
		if (new RegExp(`<\\/\\s*${binding}\\b`).test(text)) {
			edits.push({ start, end: match.end, text: `</${tag}>` });
			found = true;
			continue;
		}
		let attrs = text
			.slice(1 + binding.length, -1)
			.replace(/\/\s*$/, "")
			.trimEnd();
		if (request.framework === "vue") {
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
		edits.push({ start, end: match.end, text: `<${tag}${attrs}>` });
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
	const classAttribute = request.framework === "solid" ? "class" : "className";
	const replacement =
		`const ${className} = ${request.classExpression};\n` +
		`const ${componentName} = (props) => <${request.tag} {...props} ` +
		`${classAttribute}={cx(${className}, props.${classAttribute})} />;\n` +
		`export default ${componentName};`;
	const end = expressionStart + expression.length;
	return {
		code: request.source.slice(0, exportMatch.index) + replacement + request.source.slice(end),
		changed: true,
		needsCx: true,
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
	const vue = framework === "vue";
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
					kind: "dynamic-values",
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
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const jsx = getHostFrameworkAdapter(framework)?.syntax === "jsx";
	const vue = framework === "vue";
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
					kind: "dynamic-values",
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
		id: "jsx-intrinsic-component",
		frameworks: HOST_FRAMEWORK_REGISTRY.adapters
			.filter((adapter) => adapter.syntax === "jsx")
			.map((adapter) => adapter.id),
		rewrite: rewriteJsx,
		rewriteDeclaration: rewriteJsxDeclaration,
		rewriteStandalone: rewriteStandaloneJsx,
	},
	{
		schema: HOST_COMPONENT_REWRITER_SCHEMA,
		id: "template-intrinsic-component",
		frameworks: HOST_FRAMEWORK_REGISTRY.adapters
			.filter((adapter) => adapter.syntax === "template")
			.map((adapter) => adapter.id),
		rewrite: rewriteTemplate,
	},
];

export function getHostComponentRewriter(framework: string): HostComponentRewriter | undefined {
	return rewriters.find((rewriter) => rewriter.frameworks.includes(framework));
}
