import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	CodemodPatternId,
	StyleProgramConditionOrder,
	StyleProgramEmissionHint,
} from "../identifiers.ts";

const runtimeImports = [
	'import { createRuntimeCss } from "pandwind/css/runtime";',
	'import { pandwindPreset } from "pandwind/preset";',
	"const css = createRuntimeCss(pandwindPreset);",
] as const;

function stylexWhenCondition(expression: string): string | undefined {
	const when = expression.match(
		/^stylex\.when\.(ancestor|descendant|siblingBefore|siblingAfter|anySibling)\(\s*(['"])([^'"]+)\2\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)$/,
	);
	if (when?.[1] === undefined || when[3] === undefined) return undefined;
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

function sourceObjectOptions(source: string) {
	const conditionValues = Object.fromEntries(
		[
			...source.matchAll(
				/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])(@(?:media|supports|container)\b[^'"]*)\2/g,
			),
		].map((match) => [match[1], match[3]]),
	);
	const computedKeys = Object.fromEntries(
		[...source.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g)].map((match) => [
			`${match[1]}.${match[2]}`,
			`--${match[2]}`,
		]),
	);
	return {
		conditionValues,
		computedKeys,
		computedKeyResolver: stylexWhenCondition,
		propertyValueConditions: true,
		preserveDefaultGroup: true,
		canonicalization: {
			ignoredConditions: [{ kind: "named" as const, name: "base" }],
			conditionalOrder: StyleProgramConditionOrder.Depth,
		},
		valueTransforms: { "*": stylexNumericValue },
	};
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

function stylexNumericValue(value: StyleValue, property?: string): StyleValue {
	const numeric =
		value.kind === "literal" && typeof value.value === "number"
			? value.value
			: value.kind === "dynamic"
				? evaluateNumericExpression(value.expression)
				: undefined;
	if (numeric === undefined || !Number.isFinite(numeric)) return value;
	if (STYLEX_UNITLESS_PROPERTIES.has(property ?? "")) return { kind: "literal", value: numeric };
	return { kind: "literal", value: `${numeric}px` };
}

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

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function keyframesText(program: StyleProgram): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(rule.name ?? "animation").replace(/[^A-Za-z0-9_-]/g, "-")}`;
	const children = rule.children.map(
		(child) =>
			`{ kind: "style", selector: ${JSON.stringify(child.selector ?? "from")}, declarations: [${child.declarations
				.map(
					(declaration) =>
						`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
				)
				.join(", ")}] }`,
	);
	return `(css.sheet.registerSemanticRules([{ kind: "keyframes", name: ${JSON.stringify(name)}, children: [${children.join(", ")}] }]), ${JSON.stringify(name)})`;
}

function varsText(program: StyleProgram): string {
	const declarations = program.rules.flatMap((rule) => rule.declarations);
	const registration = declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ");
	const references = declarations
		.map(
			(declaration) =>
				`${JSON.stringify(declaration.property)}: ${JSON.stringify(`var(${declaration.property})`)}`,
		)
		.join(", ");
	return `(css.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [${registration}] }]), { ${references} })`;
}

function normalizeStyleXVariables(program: StyleProgram): StyleProgram {
	const root = program.rules[0];
	return {
		...program,
		rules:
			root === undefined
				? program.rules
				: [{ ...root, kind: "global", selector: ":root" }, ...program.rules.slice(1)],
		emissionHints: [...(program.emissionHints ?? []), StyleProgramEmissionHint.GlobalVariables],
	};
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.StyleX,
	patterns: [
		{
			name: CodemodPatternId.StyleXCreate,
			regex: /\bstylex\.create\s*\(\s*\{/g,
			objectKind: "named",
		},
		{
			name: CodemodPatternId.StyleXKeyframes,
			regex: /\bstylex\.keyframes\s*\(\s*\{/g,
			kind: "keyframes",
		},
		{
			name: CodemodPatternId.StyleXDefineVars,
			regex: /\bstylex\.defineVars\s*\(\s*\{/g,
			transform: normalizeStyleXVariables,
		},
	],
	packages: dependency("@stylexjs/stylex", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.StyleX, "partial", {
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
	sourceObjectOptions,
	migration: {
		prepareDynamic: ({ source, targetId, binding }) => ({
			handled:
				targetId === CodemodAdapterId.Pandwind &&
				binding !== undefined &&
				(new RegExp(
					`\\bstylex\\.props\\([\\s\\S]*?\\b${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*(?:\\.|\\[)`,
				).test(source) ||
					new RegExp(
						`\\bexport\\s+(?:const|let|var)\\s+${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=`,
					).test(source)),
		}),
		rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			let rewritten = code;
			// StyleX permits runtime-generated selector keys such as
			// `Object.fromEntries([`:nth-child(...)`, value])`; Pandwind's
			// self-selector dialect needs the explicit `&` prefix.
			rewritten = rewritten.replace(
				/(Object\.fromEntries\(\s*\[[\s\S]*?)([`"'])(?=(?:[:.]|\u005b))/g,
				"$1$2&",
			);
			rewritten = rewritten.replaceAll("stylex.defineConsts(", "(");
			rewritten = rewritten.replaceAll("stylex.types.angle(", "(");
			rewritten = rewritten.replace(
				/import\s*\{\s*type\s+StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
				"type StyleXStyles = Record<string, string> | string;",
			);
			rewritten = rewritten.replaceAll("stylex.StyleXStyles", "Record<string, string> | string");
			rewritten = rewritten.replace(
				/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*stylex\.defineMarker\(\)/g,
				(_match, declaration: string, binding: string) =>
					`${declaration} ${binding} = ${JSON.stringify(`pw-marker-${binding}`)}`,
			);
			rewritten = rewritten.replaceAll("stylex.defaultMarker()", '"pw-default-marker"');
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
				rewritten = rewritten.replace(
					new RegExp(
						`\\bstylex\\.props\\((\\s*${escaped}(?:\\s*\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\]))`,
						"g",
					),
					"css.props($1",
				);
			}
			rewritten = rewritten.replaceAll("stylex.props(", "css.props(");
			return {
				code: rewritten,
				imports: rewritten === code ? [] : runtimeImports,
				residuals: [],
			};
		},
	},
	emit(program, { programObject }) {
		if (program.source?.pattern === CodemodPatternId.StyleXKeyframes) {
			return {
				text: keyframesText(program),
				imports: runtimeImports,
			};
		}
		if (program.source?.pattern === CodemodPatternId.StyleXDefineVars) {
			return {
				text: varsText(program),
				imports: runtimeImports,
			};
		}
		return {
			text: `css.group(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
});
