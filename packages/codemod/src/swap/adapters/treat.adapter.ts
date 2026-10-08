import { targetImportBinding } from "../target-import-binding.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterComponentRewriteContext } from "../adapter-contract.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleProgramEmissionHint,
} from "../identifiers.ts";
import {
	isPlainReactStyleProgram,
	reactStyledComponentArtifact,
	reactStyledComponentUnsupportedReason,
	rewriteReactStyledComponent,
} from "./react-styled-component.ts";

const componentResidual = (text: string, hint: string) => ({
	kind: StyleProgramResidualKindTag.Component,
	text,
	hint,
});

const rewriteComponent = (context: AdapterComponentRewriteContext) => {
	if (context.phase === "preflight") {
		const reason = reactStyledComponentUnsupportedReason(
			context.file,
			context.source,
			context.program,
			context.sourceFramework,
		);
		return reason === undefined
			? { code: context.code, residuals: [] }
			: { code: context.code, residuals: [componentResidual(context.binding, reason)] };
	}
	const rewrite = rewriteReactStyledComponent(context, context.emittedExpression);
	return {
		code: rewrite.code,
		...(rewrite.imports.length === 0 ? {} : { imports: rewrite.imports }),
		residuals:
			rewrite.reason === undefined ? [] : [componentResidual(context.binding, rewrite.reason)],
	};
};

const treat = makeExtraAdapter({
	id: CodemodAdapterId.Treat,
	officialApi: {
		apis: [
			{ name: "style", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
			{ name: "createTheme", status: AdapterOfficialApiStatusTag.CompatibilityOnly },
		],
	},
	modules: ["treat"],
	sourceModulesSideEffectFree: ["treat"],
	staticStyleCalls: [{ moduleSpecifier: "treat", importedName: "style" }],
	packages: { packages: [{ name: "treat", kind: AdapterDependencyKindTag.Development }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
	residualPatterns: [
		{
			name: "createTheme",
			regex: /\bcreateTheme\s*\(/g,
			kind: StyleProgramResidualKindTag.Configuration,
			hint: "Treat createTheme requires theme-aware target lowering",
		},
	],
	targetImports: ['import { style } from "treat";'],
	migration: {
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === CodemodAdapterId.YumCSS &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
			standalone:
				targetId === CodemodAdapterId.YumCSS &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
		}),
	},
	sourceObjectOptions: { emissionHints: [StyleProgramEmissionHint.RuntimeClass] },
	targetPolicy: {
		moduleFile: {
			acceptedSuffixes: [".treat.ts", ".treat.js"],
			outputExtension: ".treat.ts",
			importSpecifierExtension: ".treat",
			unsupportedFileHint: "Treat styles must be emitted from a .treat.ts or .treat.js module",
		},
		handlesHostRewrites: true,
		dynamicClassCarrier: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.React],
		hostRepresentation: StyleHostRepresentationKind.Class,
		rewriteComponent,
	},
	targetEmit: (program, context, programObject) => {
		const binding = context?.host?.binding;
		if (
			context?.host?.representation !== StyleHostRepresentationKind.Class ||
			context.host.framework !== BuiltinHostFramework.React ||
			context.host.subject === undefined ||
			binding === undefined ||
			!isPlainReactStyleProgram(program)
		) {
			const local = targetImportBinding({
				context,
				importedName: "style",
				moduleSpecifier: "treat",
				preserveSourceBindings:
					program.residuals.length > 0 || (context?.loweringResiduals?.length ?? 0) > 0,
				preferred: "style",
			});
			return {
				text: program.rules.some((rule) => rule.name !== undefined)
					? `{ ${program.rules
							.filter((rule) => rule.name !== undefined && rule.kind === StyleRuleKindTag.Style)
							.map(
								(rule) =>
									`${JSON.stringify(rule.name)}: ${local.localName}(${programObject({ ...program, rules: [{ ...rule, name: undefined }], declarations: rule.declarations })})`,
							)
							.join(", ")} }`
					: `${local.localName}(${programObject(program)})`,
				imports: local.importRequired
					? [
							`import { style${local.localName === "style" ? "" : ` as ${local.localName}`} } from "treat";`,
						]
					: [],
				residuals: [...program.residuals],
			};
		}
		const artifact = reactStyledComponentArtifact(
			context,
			binding,
			".treat.ts",
			".treat",
			`import { style } from "treat";\nexport const __yumcss${binding}Styles = style(${programObject(program)});\n`,
			"Treat styles for a migrated React component",
		);
		if (artifact === undefined)
			return {
				text: "",
				semantic: program,
				residuals: [
					componentResidual(
						binding,
						"the generated Treat path cannot be resolved relative to the project root",
					),
				],
			};
		return {
			text: artifact.local,
			semantic: program,
			imports: [`import { ${artifact.local} } from ${JSON.stringify(artifact.specifier)};`],
			generatedFiles: [artifact.file],
			residuals: [],
		};
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
});

export default {
	...treat,
	parse(source: string, context: AdapterParseContext) {
		const parsed = treat.parse(source, context);
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program),
			})),
		};
	},
};
