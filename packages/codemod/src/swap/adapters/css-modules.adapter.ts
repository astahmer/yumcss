import { MagicString } from "magic-string";
import { SOURCE_SCANNER_SERVICE, SourceBindings } from "pandwind/source";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../../path-utils.ts";
import type {
	AdapterComponentRewriteContext,
	AdapterEmitContext,
	AdapterGeneratedFile,
	StyleAdapter,
} from "../adapter-contract.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	hasComponentAttributeUse,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { parseObjectLiteral } from "../parse.ts";
import { CodemodAdapterId, StyleHostRepresentationKind } from "../identifiers.ts";
import {
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	type StyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

const baseAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.CssModules,
	name: "css-modules",
	extensions: [".module.css", ".module.scss", ".module.sass"],
	packages: { packages: [] },
	composition: "partial",
});

const unsupportedComponentHint =
	"css-modules can emit only static React styled intrinsics with literal DOM attrs and without polymorphic as props";

const globalDomAttributes = new Set([
	"accessKey",
	"autoCapitalize",
	"classID",
	"contentEditable",
	"dir",
	"draggable",
	"enterKeyHint",
	"hidden",
	"id",
	"lang",
	"nonce",
	"role",
	"slot",
	"spellCheck",
	"tabIndex",
	"title",
	"translate",
]);

const staticDomAttrsExpression = (
	expression: string | undefined,
	tag: string,
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
		attributes.keys.some(({ key }) => {
			if (filteredPropPrefixes.some((prefix) => key.startsWith(prefix))) return false;
			if (key === "type") return tag !== "button" && tag !== "input";
			if (key === "as" || key === "forwardedAs" || key === "className" || key === "style")
				return true;
			return (
				key.startsWith("$") ||
				(!globalDomAttributes.has(key) &&
					!/^aria-[a-z0-9-]+$/u.test(key) &&
					!/^data-[a-z0-9-]+$/u.test(key))
			);
		})
	)
		return undefined;
	return `(${normalized})`;
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

const isPlainStyleProgram = (program: StyleProgram): boolean =>
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
		`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*$`,
		"u",
	).test(prefix);
};

const componentHostUnsupportedReason = (
	file: string,
	source: string,
	program: StyleProgram,
): string | undefined => {
	const subject = program.source?.subject;
	if (sourceHasParseErrors(file, source)) return "the source file contains parse errors";
	if (!file.endsWith(".tsx")) return "the React wrapper requires a TSX source module";
	if (program.source?.framework !== BuiltinHostFramework.React)
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
		return "attrs must be a literal object of supported DOM attributes without class, style, or polymorphic props";
	const binding = sourceBindingForProgram(file, source, program);
	if (binding !== undefined) {
		if (hasComponentAttributeUse({ source, file, binding, attribute: "as" }))
			return "the component has polymorphic as usage";
		if (hasComponentAttributeUse({ source, file, binding, attribute: "forwardedAs" }))
			return "the component has forwardedAs usage";
	}
	return undefined;
};

const componentUnsupportedReason = (
	file: string,
	source: string,
	program: StyleProgram,
): string | undefined => {
	const hostReason = componentHostUnsupportedReason(file, source, program);
	if (hostReason !== undefined) return hostReason;
	const subject = program.source?.subject;
	if (subject === undefined) return "the styled subject is not a verified intrinsic element";
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
	if (!isPlainStyleProgram(program))
		return "CSS Modules lowering requires one flat rule with string literal values";
	const binding = sourceBindingForProgram(file, source, program);
	if (binding === undefined || !declarationPrefixExists(source, file, program))
		return "the styled expression is not a named component declaration";
	return undefined;
};

const componentResidual = (
	text: string,
	hint = unsupportedComponentHint,
): StyleProgramResidual => ({
	kind: StyleProgramResidualKindTag.Capability,
	text,
	hint,
});

const projectRelativeFile = (context: AdapterEmitContext): string | undefined => {
	if (!isAbsoluteDocumentPath(context.file)) return context.file;
	if (context.config.root === undefined) return undefined;
	return relativeDocumentPath(context.config.root, context.file);
};

const stylesheetArtifact = (
	context: AdapterEmitContext,
	binding: string,
): { readonly path: string; readonly specifier: string; readonly local: string } | undefined => {
	const file = projectRelativeFile(context);
	if (file === undefined) return undefined;
	const directory = dirnameDocumentPath(file);
	const fileName = file.split("/").at(-1);
	if (fileName === undefined) return undefined;
	const stem = fileName.replace(/\.[^.]+$/u, "");
	const suffix = context.index === 0 ? "" : `-${binding}`;
	const path = joinDocumentPath(directory, `${stem}${suffix}.module.css`);
	let specifier = relativeDocumentPath(directory, path);
	if (!specifier.startsWith(".")) specifier = `./${specifier}`;
	return { path, specifier, local: `__pandwind${binding}Styles` };
};

const stylesheetSourceMap = (
	context: AdapterEmitContext,
	program: StyleProgram,
	path: string,
	content: string,
): string | undefined => {
	const sourceStart = program.source?.start;
	const sourceFile = projectRelativeFile(context);
	if (
		context.sourceText === undefined ||
		sourceStart === undefined ||
		sourceFile === undefined ||
		sourceStart < 0 ||
		sourceStart >= context.sourceText.length
	)
		return undefined;

	const source = new MagicString(context.sourceText);
	source.update(sourceStart, sourceStart + 1, content);
	return source
		.snip(sourceStart, sourceStart + 1)
		.generateMap({ file: path, source: sourceFile, includeContent: true, hires: "boundary" })
		.toString();
};

const targetComponentRewrite = (
	context: AdapterComponentRewriteContext,
): {
	readonly code: string;
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
} => {
	if (context.phase === "preflight") {
		const reason = componentHostUnsupportedReason(context.file, context.source, context.program);
		return reason === undefined
			? { code: context.code, residuals: [] }
			: { code: context.code, residuals: [componentResidual(context.binding, reason)] };
	}
	if (
		context.framework !== BuiltinHostFramework.React ||
		context.file.endsWith(".tsx") === false ||
		sourceHasParseErrors(context.file, context.source) ||
		(context.attrsExpression !== undefined &&
			staticDomAttrsExpression(
				context.attrsExpression,
				context.tag,
				context.program.source?.hostPropFilter?.prefixes,
			) === undefined) ||
		!isPlainStyleProgram(context.program)
	)
		return { code: context.code, residuals: [componentResidual(context.binding)] };
	if (context.code === context.source) return { code: context.code, residuals: [] };
	const tag = context.tag;
	const classExpression = /^(__pandwind[A-Za-z_$][\w$]*Styles)\.root$/u.exec(
		context.emittedExpression,
	);
	if (classExpression === null)
		return { code: context.code, residuals: [componentResidual(context.binding)] };
	const styleBinding = classExpression[1];
	const attrsExpression = staticDomAttrsExpression(
		context.attrsExpression,
		tag,
		context.program.source?.hostPropFilter?.prefixes,
	);
	const escapedBinding = context.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedExpression = context.emittedExpression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(
		`((?:export\\s+)?(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*)${escapedExpression}(?=\\s*(?:;|$|\\n))`,
		"u",
	);
	const match = assignment.exec(context.code);
	if (match === null)
		return { code: context.code, residuals: [componentResidual(context.binding)] };
	const forwardRefBinding = `__pandwind${context.binding}ForwardRef`;
	const componentRefBinding = `__pandwind${context.binding}ComponentRef`;
	const componentPropsBinding = `__pandwind${context.binding}ComponentProps`;
	const tagType = JSON.stringify(tag);
	const filterPredicate = hostPropFilterPredicate(context.program);
	const filterType = hostPropFilterType(context.program);
	const forwardedProps =
		attrsExpression === undefined
			? `Object.fromEntries(Object.entries(props).filter(([key]) => ${filterPredicate}))`
			: `Object.fromEntries([...Object.entries(props), ...Object.entries(${attrsExpression})].filter(([key]) => ${filterPredicate}))`;
	const replacement =
		`${forwardRefBinding}<${componentRefBinding}<${tagType}>, ${componentPropsBinding}<${tagType}>${filterType}>(` +
		`({ className, ...props }, ref) => (` +
		`<${tag} {...${forwardedProps}} ref={ref} className={[${styleBinding}.root, className].filter(Boolean).join(" ")} />` +
		`))`;
	return {
		code: `${context.code.slice(0, match.index)}${match[1]}${replacement}${context.code.slice(match.index + match[0].length)}`,
		imports: [
			`import { forwardRef as ${forwardRefBinding} } from "react";`,
			`import type { ComponentRef as ${componentRefBinding}, ComponentPropsWithoutRef as ${componentPropsBinding} } from "react";`,
		],
		residuals: [],
	};
};

const stylesheetPolicy = baseAdapter.migration?.targetPolicy;

export const cssModulesAdapter: StyleAdapter = {
	...baseAdapter,
	migration: {
		...baseAdapter.migration,
		targetPolicy: {
			...stylesheetPolicy,
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostFrameworks: [BuiltinHostFramework.React],
			hostRepresentation: StyleHostRepresentationKind.Class,
			preflight: (context) => {
				if (context.program.source?.subject === undefined)
					return stylesheetPolicy?.preflight?.(context) ?? [];
				const reason = componentUnsupportedReason(context.file, context.source, context.program);
				return reason === undefined
					? []
					: [componentResidual(context.program.source.subject, reason)];
			},
			rewriteComponent: targetComponentRewrite,
		},
	},
	emit: (program, context) => {
		const emission = baseAdapter.emit(program, context);
		const binding = context.host?.binding;
		const subject = context.host?.subject;
		if (
			binding === undefined ||
			subject === undefined ||
			context.host?.framework !== BuiltinHostFramework.React ||
			intrinsicTagForSubject(subject) === undefined ||
			StyleProgramAnalysis.hasDynamic(program) ||
			!isPlainStyleProgram(program)
		)
			return emission;
		const artifact = stylesheetArtifact(context, binding);
		if (artifact === undefined || emission.residuals.length > 0 || emission.text.trim() === "")
			return {
				text: "",
				residuals: [componentResidual(subject)],
			};
		const sourceMapPath = `${artifact.path}.map`;
		const sourceMapName = sourceMapPath.split("/").at(-1);
		const baseContent = `.root { ${emission.text.trim()} }\n`;
		const sourceMap =
			sourceMapName === undefined
				? undefined
				: stylesheetSourceMap(
						context,
						program,
						artifact.path,
						`${baseContent}/*# sourceMappingURL=${sourceMapName} */\n`,
					);
		const generatedFile: AdapterGeneratedFile = {
			path: artifact.path,
			content:
				sourceMap === undefined
					? baseContent
					: `${baseContent}/*# sourceMappingURL=${sourceMapName} */\n`,
			purpose: "CSS Modules styles for a migrated React component",
		};
		return {
			...emission,
			text: `${artifact.local}.root`,
			imports: [
				...(emission.imports ?? []),
				`import ${artifact.local} from ${JSON.stringify(artifact.specifier)};`,
			],
			generatedFiles: [
				...(emission.generatedFiles ?? []),
				generatedFile,
				...(sourceMap === undefined
					? []
					: [
							{
								path: sourceMapPath,
								content: sourceMap,
								purpose: "CSS Modules source map for a migrated React component",
							},
						]),
			],
		};
	},
};
