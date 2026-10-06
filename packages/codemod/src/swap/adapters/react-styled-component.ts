import { SOURCE_SCANNER_SERVICE, SourceBindings } from "yumcss/source";
import type {
	AdapterComponentRewriteContext,
	AdapterEmitContext,
	AdapterGeneratedFile,
} from "../adapter-contract.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../../path-utils.ts";
import { BuiltinHostFramework, type HostFramework } from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	hasComponentAttributeUse,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { parseObjectLiteral } from "../parse.ts";
import { StyleRuleKindTag, StyleValueKindTag, type StyleProgram } from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

export const staticDomAttrsExpression = (
	expression: string | undefined,
	_tag: string,
	filteredPropPrefixes: readonly string[] = [],
): string | undefined => {
	if (expression === undefined) return undefined;
	const normalized = expression.trim();
	if (!normalized.startsWith("{") || !normalized.endsWith("}")) return undefined;
	const body = normalized.slice(1, -1);
	if (body.trim() === "") return "({})";
	const attributes = parseObjectLiteral(body);
	if (attributes === null) return undefined;
	if (
		attributes.keys.some(({ key, value }) => {
			if (filteredPropPrefixes.some((prefix) => key.startsWith(prefix))) return false;
			if (key === "as") return typeof value !== "string";
			if (["forwardedAs", "key", "ref"].includes(key)) return true;
			if (key === "className") return typeof value !== "string";
			return (
				key === "style" && (typeof value !== "object" || value === null || Array.isArray(value))
			);
		})
	)
		return undefined;
	return `(${normalized})`;
};

const staticDomAttrsTag = (expression: string | undefined, fallbackTag: string): string => {
	if (expression === undefined) return fallbackTag;
	const start = expression.indexOf("{");
	const end = expression.lastIndexOf("}");
	if (start < 0 || end <= start) return fallbackTag;
	const attributes = parseObjectLiteral(expression.slice(start + 1, end));
	const tag = attributes?.keys.find(({ key }) => key === "as")?.value;
	return typeof tag === "string" ? tag : fallbackTag;
};

const hostPropFilterPredicate = (program: StyleProgram): string => {
	const prefixes = program.source?.hostPropFilter?.prefixes ?? [];
	return prefixes.length === 0
		? "true"
		: prefixes.map((prefix) => `!key.startsWith(${JSON.stringify(prefix)})`).join(" && ");
};

const hostPropFilterType = (program: StyleProgram): string => {
	const prefixes = program.source?.hostPropFilter?.prefixes ?? [];
	if (prefixes.length === 0) return "";
	const keys = prefixes.map((prefix) => `\`${prefix}\${string}\``).join(" | ");
	return ` & { readonly [key in ${keys}]?: unknown }`;
};

export const isPlainReactStyleProgram = (program: StyleProgram): boolean =>
	program.rules.length === 1 &&
	program.rules[0]?.kind === StyleRuleKindTag.Style &&
	program.rules[0].name === undefined &&
	program.rules[0].selector === undefined &&
	program.rules[0].conditions.length === 0 &&
	program.rules[0].children.length === 0 &&
	program.rules[0].declarations.length > 0 &&
	program.rules[0].declarations.every(
		(declaration) =>
			declaration.value.kind === StyleValueKindTag.Literal &&
			typeof declaration.value.value === "string",
	);

export const isReactWrapperSourceFile = (file: string): boolean => /\.(?:[jt]sx?)$/u.test(file);

const sourceHasParseErrors = (file: string, source: string): boolean => {
	try {
		return SOURCE_SCANNER_SERVICE.scan({ file, source }).diagnostics.some(
			(diagnostic) => diagnostic.kind === "parse",
		);
	} catch {
		return true;
	}
};

const sourceBindingForProgram = (
	file: string,
	source: string,
	program: StyleProgram,
): string | undefined => {
	const start = program.source?.start;
	if (start === undefined) return undefined;
	return SourceBindings.fromDocument({ file, source }).callSites.find(
		(callSite) => callSite.start === start,
	)?.assignedBinding;
};

const declarationPrefixExists = (source: string, file: string, program: StyleProgram): boolean => {
	const binding = sourceBindingForProgram(file, source, program);
	const start = program.source?.start;
	if (binding === undefined || start === undefined) return false;
	const lineStart = source.lastIndexOf("\n", start - 1) + 1;
	const prefix = source.slice(lineStart, start);
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:^|;)\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*$`,
		"u",
	).test(prefix);
};

export const reactStyledComponentUnsupportedReason = (
	file: string,
	source: string,
	program: StyleProgram,
	sourceFramework: HostFramework | undefined = program.source?.framework,
): string | undefined => {
	const subject = program.source?.subject;
	if (sourceHasParseErrors(file, source)) return "the source file contains parse errors";
	if (!isReactWrapperSourceFile(file))
		return "the React wrapper requires a JavaScript or TypeScript source module";
	if (sourceFramework !== BuiltinHostFramework.React)
		return "the source host is not verified as React";
	if (subject === undefined || intrinsicTagForSubject(subject) === undefined)
		return "the styled subject is not a verified intrinsic element";
	const attrsExpression = componentAttrsExpressionForSubject(subject);
	if (
		attrsExpression !== undefined &&
		staticDomAttrsExpression(
			attrsExpression,
			intrinsicTagForSubject(subject) ?? "",
			program.source?.hostPropFilter?.prefixes,
		) === undefined
	)
		return "attrs must be a literal object with static values and supported as, className, and style values";
	const binding = sourceBindingForProgram(file, source, program);
	if (binding !== undefined) {
		if (hasComponentAttributeUse({ source, file, binding, attribute: "forwardedAs" }))
			return "the component has forwardedAs usage";
	}
	if (!declarationPrefixExists(source, file, program))
		return "the styled expression is not a named component declaration";
	if (program.residuals.length > 0) return "the style program already contains source residuals";
	if ((program.themes?.length ?? 0) > 0)
		return "theme-bound styles need a project theme projection";
	if ((program.compositions?.length ?? 0) > 0)
		return "composed styles need a target component projection";
	if ((program.plugins?.length ?? 0) > 0)
		return "source plugin transforms need an equivalent target transform";
	if (
		program.runtime !== undefined &&
		(program.runtime.framework !== BuiltinHostFramework.React ||
			program.runtime.phase !== "render" ||
			program.runtime.dependencies.length > 0)
	)
		return "runtime style dependencies need a target runtime";
	if (StyleProgramAnalysis.hasDynamic(program))
		return "dynamic values need a target runtime or verified CSS variable carrier";
	if (!isPlainReactStyleProgram(program))
		return "the React class wrapper requires one flat rule with string literal values";
	return undefined;
};

export const rewriteReactStyledComponent = (
	context: AdapterComponentRewriteContext,
	classNameExpression: string,
): { readonly code: string; readonly imports: readonly string[]; readonly reason?: string } => {
	const subject =
		context.program.source?.subject ??
		`styled.${context.tag}${context.attrsExpression === undefined ? "" : `.attrs(${context.attrsExpression})`}`;
	const program: StyleProgram = {
		...context.program,
		source: {
			...context.program.source,
			subject,
			framework: context.program.source?.framework ?? context.sourceFramework,
		},
	};
	const reason = reactStyledComponentUnsupportedReason(
		context.file,
		context.source,
		program,
		context.sourceFramework,
	);
	if (reason !== undefined) return { code: context.code, imports: [], reason };
	if (context.framework !== BuiltinHostFramework.React)
		return { code: context.code, imports: [], reason: "the source host is not verified as React" };
	if (context.code === context.source) return { code: context.code, imports: [] };
	const escapedBinding = context.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedExpression = context.emittedExpression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(
		`((?:export\\s+)?(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*)${escapedExpression}(?=\\s*(?:;|$|\\n))`,
		"u",
	);
	const match = assignment.exec(context.code);
	if (match === null)
		return {
			code: context.code,
			imports: [],
			reason: "the styled component declaration could not be rewritten safely",
		};
	const forwardRefBinding = `__yumcss${context.binding}ForwardRef`;
	const createElementBinding = `__yumcss${context.binding}CreateElement`;
	const componentRefBinding = `__yumcss${context.binding}ComponentRef`;
	const componentPropsBinding = `__yumcss${context.binding}ComponentProps`;
	const componentPropsTypeBinding = `__yumcss${context.binding}Props`;
	const typescript = context.file.endsWith(".ts") || context.file.endsWith(".tsx");
	const attrsExpression = staticDomAttrsExpression(
		context.attrsExpression ?? componentAttrsExpressionForSubject(program.source?.subject ?? ""),
		context.tag,
		program.source?.hostPropFilter?.prefixes,
	);
	const attrsValue = attrsExpression ?? "({})";
	const defaultTag = staticDomAttrsTag(attrsExpression, context.tag);
	const forwardedProps = `Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => ${hostPropFilterPredicate(program)}))`;
	const attrsDeclaration = typescript
		? `const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ${attrsValue};`
		: `const attrs = ${attrsValue};`;
	const componentDeclaration = typescript
		? `const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? ${JSON.stringify(defaultTag)}) as import("react").ElementType;`
		: `const Component = attrsAs ?? propsAs ?? propsForwardedAs ?? ${JSON.stringify(defaultTag)};`;
	const elementProps = `{ ...${forwardedProps}, ref, className: [${classNameExpression}, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) }`;
	const createElementCall = typescript
		? `${createElementBinding}(Component, ${elementProps} as import("react").ComponentPropsWithRef<import("react").ElementType>)`
		: `${createElementBinding}(Component, ${elementProps})`;
	const wrapperBody = `const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; ${attrsDeclaration} const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; ${componentDeclaration} return ${createElementCall};`;
	const replacement = typescript
		? `(() => { type ${componentPropsTypeBinding}<As extends import("react").ElementType> = Omit<${componentPropsBinding}<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties }${hostPropFilterType(program)}; type __yumcss${context.binding}PolymorphicComponent = <As extends import("react").ElementType = ${JSON.stringify(defaultTag)}>(props: ${componentPropsTypeBinding}<As> & { ref?: import("react").Ref<${componentRefBinding}<As>> }) => import("react").ReactElement | null; type __yumcss${context.binding}InternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties }${hostPropFilterType(program)}; return ${forwardRefBinding}<unknown, __yumcss${context.binding}InternalProps>((props, ref) => { ${wrapperBody} }) as __yumcss${context.binding}PolymorphicComponent; })()`
		: `${forwardRefBinding}((props, ref) => { ${wrapperBody} })`;
	return {
		code: `${context.code.slice(0, match.index)}${match[1]}${replacement}${context.code.slice(match.index + match[0].length)}`,
		imports: [
			`import { forwardRef as ${forwardRefBinding} } from "react";`,
			`import { createElement as ${createElementBinding} } from "react";`,
			...(typescript
				? [
						`import type { ComponentRef as ${componentRefBinding}, ComponentPropsWithoutRef as ${componentPropsBinding} } from "react";`,
					]
				: []),
		],
	};
};

export const reactStyledComponentArtifact = (
	context: AdapterEmitContext,
	binding: string,
	outputExtension: string,
	importSpecifierExtension: string,
	content: string,
	purpose: string,
):
	| {
			readonly file: AdapterGeneratedFile;
			readonly specifier: string;
			readonly local: string;
	  }
	| undefined => {
	const file = !isAbsoluteDocumentPath(context.file)
		? context.file
		: context.config.root === undefined
			? undefined
			: relativeDocumentPath(context.config.root, context.file);
	if (file === undefined) return undefined;
	const directory = dirnameDocumentPath(file);
	const fileName = file.split("/").at(-1);
	if (fileName === undefined) return undefined;
	const stem = fileName.replace(/\.[^.]+$/u, "");
	const suffix = context.index === 0 ? "" : `-${binding}`;
	const pathStem = `${stem}${suffix}.styles`;
	const path = joinDocumentPath(directory, `${pathStem}${outputExtension}`);
	const importPath = joinDocumentPath(directory, `${pathStem}${importSpecifierExtension}`);
	let specifier = directory === "." ? importPath : relativeDocumentPath(directory, importPath);
	if (!specifier.startsWith(".")) specifier = `./${specifier}`;
	return {
		file: { path, content, purpose },
		specifier,
		local: `__yumcss${binding}Styles`,
	};
};

export const reactStyledComponentClassName = (file: string, binding: string): string => {
	let hash = 0x811c9dc5;
	for (const character of `${file}\u0000${binding}`) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return `pw-${binding.replace(/[^A-Za-z0-9_-]/gu, "-")}-${(hash >>> 0).toString(36)}`;
};
