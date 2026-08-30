import { matchBlock } from "../source-pass-utils.ts";
import { dirname, resolve } from "node:path";
import { parse, type AtRule, type Container, type Declaration, type Rule } from "postcss";
import type { AdapterParseContext } from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { StyleProgramEmissionHint } from "./identifiers.ts";

const camelProperty = (property: string): string =>
	property.trim().replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());

interface TemplateInterpolation {
	readonly marker: string;
	readonly expression: string;
	readonly conditionalFragment?: {
		readonly parameter: string;
		readonly condition: string;
		readonly body: string;
	};
}

function conditionalCssFragment(
	expression: string,
): TemplateInterpolation["conditionalFragment"] | undefined {
	const arrow = expression.indexOf("=>");
	if (arrow < 0) return undefined;
	const parameter = expression.slice(0, arrow).trim();
	const body = expression.slice(arrow + 2).trim();
	const cssStart = body.indexOf("css`");
	if (cssStart < 0) return undefined;
	const prefix = body.slice(0, cssStart).trim();
	const condition = prefix.endsWith("&&")
		? prefix.slice(0, -2).trim()
		: prefix.endsWith("?")
			? prefix.slice(0, -1).trim()
			: undefined;
	if (condition === undefined || parameter.length === 0 || condition.length === 0) return undefined;
	const openTick = cssStart + "css".length;
	const closeTick = findTemplateLiteralEnd(body, openTick);
	if (closeTick === undefined) return undefined;
	const tail = body.slice(closeTick + 1).trim();
	if (tail !== "" && !/^:\s*(?:''|""|undefined)$/.test(tail)) return undefined;
	return { parameter, condition, body: body.slice(openTick + 1, closeTick) };
}

function conditionalFragmentDeclaration(
	fragment: NonNullable<TemplateInterpolation["conditionalFragment"]>,
): Declaration | undefined {
	try {
		const nested = parse(fragment.body, { from: "<styled-components-fragment>" });
		if (nested.nodes?.every((node) => node.type === "decl") !== true) return undefined;
		const declarations = nested.nodes.filter((node): node is Declaration => node.type === "decl");
		return declarations.length === 1 ? declarations[0] : undefined;
	} catch {
		return undefined;
	}
}

function resolveNamedCssTemplate(
	source: string,
	name: string,
	context: AdapterParseContext,
): string | undefined {
	const declaration = new RegExp(`${name}[ ]*=[ ]*(?:css[ ]*)?\\x60`).exec(source);
	if (declaration !== null) {
		const openTick = declaration.index + declaration[0].length - 1;
		const closeTick = findTemplateLiteralEnd(source, openTick);
		if (closeTick !== undefined) return source.slice(openTick + 1, closeTick);
	}
	if (context.readFile === undefined) return undefined;
	const importMatch = new RegExp(
		`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`,
	).exec(source);
	const specifier = importMatch?.[1];
	if (specifier === undefined || !specifier.startsWith(".")) return undefined;
	const sourceFile =
		context.root === undefined ? resolve(context.file) : resolve(context.root, context.file);
	const modulePath = resolve(dirname(sourceFile), specifier);
	const candidates = [
		modulePath,
		...([".ts", ".tsx", ".js", ".jsx"] as const).map((extension) => `${modulePath}${extension}`),
		...([".ts", ".tsx", ".js", ".jsx"] as const).map((extension) =>
			resolve(modulePath, `index${extension}`),
		),
	];
	const importedSource = candidates
		.map((file) => context.readFile?.(file))
		.find((value) => value !== undefined);
	if (importedSource === undefined) return undefined;
	return resolveNamedCssTemplate(importedSource, name, {
		...context,
		source: importedSource,
		file: candidates[0]!,
	});
}

function expandStyleFragments(body: string, context: AdapterParseContext): string {
	const source = context.source;
	let expanded = body;
	for (let pass = 0; pass < 4; pass++) {
		let changed = false;
		let output = "";
		let cursor = 0;
		for (let index = 0; index < expanded.length; index++) {
			if (expanded[index] !== "$" || expanded[index + 1] !== "{") continue;
			const block = matchBlock(expanded, index + 1);
			if (block === null) continue;
			const expression = block.body.trim();
			const inline = new RegExp("^(?:mobile|phone)[(][ ]*css\\x60([^]*)\\x60[ ]*[)]$").exec(
				expression,
			);
			const direct = new RegExp("^css\\x60([^]*)\\x60$").exec(expression);
			const named = /^[A-Za-z_$][\w$]*$/.test(expression)
				? resolveNamedCssTemplate(source, expression, context)
				: undefined;
			const expandedNamed = named === undefined ? undefined : expandStyleFragments(named, context);
			const replacement =
				inline?.[1] !== undefined
					? `@media (max-width: ${expression.startsWith("mobile") ? "62.5" : "40.625"}em) {${inline[1]}}`
					: (direct?.[1] ?? (expandedNamed?.includes("${") ? undefined : expandedNamed));
			if (replacement === undefined) continue;
			output += expanded.slice(cursor, index) + replacement;
			index = block.end - 1;
			cursor = block.end;
			changed = true;
		}
		if (!changed) return expanded;
		output += expanded.slice(cursor);
		expanded = output;
	}
	return expanded;
}

function extractInterpolations(body: string): {
	readonly css: string;
	readonly values: readonly TemplateInterpolation[];
	readonly fragmentResiduals: readonly StyleProgramResidual[];
} {
	const values: TemplateInterpolation[] = [];
	let css = "";
	let cursor = 0;
	for (let index = 0; index < body.length; index++) {
		if (body[index] !== "$" || body[index + 1] !== "{") continue;
		const block = matchBlock(body, index + 1);
		if (block === null) continue;
		css += body.slice(cursor, index);
		const marker = `__PANDWIND_INTERPOLATION_${values.length}__`;
		const expression = block.body.trim();
		values.push({
			marker,
			expression,
			conditionalFragment: conditionalCssFragment(expression),
		});
		css += marker;
		index = block.end - 1;
		cursor = block.end;
	}
	css += body.slice(cursor);
	const fragmentResiduals: StyleProgramResidual[] = [];
	css = css.replace(
		/(^|[;{}]\s*)__PANDWIND_INTERPOLATION_(\d+)__(?=\s*[;{}]|$)/g,
		(_match, prefix: string, index: string) => {
			const value = values[Number(index)];
			if (
				value !== undefined &&
				(value.conditionalFragment === undefined ||
					conditionalFragmentDeclaration(value.conditionalFragment) === undefined)
			)
				fragmentResiduals.push({
					kind: "parse",
					text: `\${${value.expression}}`,
					hint: "standalone template interpolations require a composed style fragment lowering",
				});
			return prefix;
		},
	);
	return { css, values, fragmentResiduals };
}

function dynamicValue(
	raw: string,
	interpolations: readonly TemplateInterpolation[],
	residuals: StyleProgramResidual[],
): StyleDeclaration["value"] {
	const markers = interpolations.filter((item) => raw.includes(item.marker));
	if (markers.length === 0) return { kind: "literal", value: raw.trim() };
	if (markers.length === 1 && raw.trim() === markers[0]!.marker) {
		const fragment = markers[0]!.conditionalFragment;
		if (fragment !== undefined) {
			const declaration = conditionalFragmentDeclaration(fragment);
			if (declaration !== undefined)
				return {
					kind: "dynamic",
					expression: `(${fragment.parameter}) => (${fragment.condition}) ? ${JSON.stringify(declaration.value.trim())} : undefined`,
					lowering: "custom-property",
				};
		}
	}
	for (const marker of markers)
		residuals.push({
			kind: "dynamic",
			text: raw,
			hint: marker.expression.includes("=>")
				? "template function interpolation requires a framework prop wrapper"
				: "template interpolation requires a runtime-aware lowering",
		});
	if (raw.trim() === markers[0]?.marker && markers.length === 1)
		return { kind: "dynamic", expression: markers[0]!.expression, lowering: "residual" };
	let expression = raw;
	for (const marker of markers)
		expression = expression.replaceAll(marker.marker, `\${${marker.expression}}`);
	return {
		kind: "dynamic",
		expression: `\`${expression.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``,
		lowering: "residual",
	};
}

/** Styled template syntax treats a leading combinator as relative to its subject. */
function normalizeNestedSelector(selector: string): string {
	const selectors = selector.split(",").map((part) => part.trim());
	if (selectors.some((part) => /^[+>~]/.test(part)))
		return selectors.map((part) => (/^[+>~]/.test(part) ? `& ${part}` : part)).join(", ");
	return selector;
}

/** Find a template's closing backtick without mistaking nested expression templates for it. */
export function findTemplateLiteralEnd(source: string, openTick: number): number | undefined {
	for (let index = openTick + 1; index < source.length; index++) {
		const character = source[index];
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === "$" && source[index + 1] === "{") {
			const interpolation = matchBlock(source, index + 1);
			if (interpolation !== null) {
				index = interpolation.end - 1;
				continue;
			}
		}
		if (character === "`") return index;
	}
	return undefined;
}

/** Parse the static and dynamic subset shared by tagged-template adapters. */
export function parseAdapterTemplate(
	body: string,
	context: AdapterParseContext,
	adapter: string,
	start: number,
): StyleProgram {
	const templateBody = expandStyleFragments(body, context);
	const extracted = extractInterpolations(templateBody);
	const residuals: StyleProgramResidual[] = [...extracted.fragmentResiduals];
	let root;
	try {
		root = parse(extracted.css, { from: context.file });
	} catch (error) {
		return styleProgramFromRules(
			[
				{
					kind: "style",
					conditions: [],
					declarations: [],
					children: [],
					order: 0,
				},
			],
			{
				source: { file: context.file, start, adapter, template: templateBody },
				emissionHints: [StyleProgramEmissionHint.RawTemplate],
				residuals: [
					...residuals,
					{
						kind: "parse",
						text: body,
						hint: `${adapter} template CSS could not be parsed: ${String(error)}`,
					},
				],
			},
		);
	}

	let order = 0;
	const parseContainer = (
		container: Container,
		conditions: StyleProgram["rules"][number]["conditions"] = [],
	) => {
		const declarations: StyleDeclaration[] = [];
		const children: StyleProgram["rules"][number][] = [];
		for (const node of container.nodes ?? []) {
			if (node.type === "decl") {
				const declaration = node as Declaration;
				declarations.push({
					conditions: [],
					property: camelProperty(declaration.prop),
					value: dynamicValue(declaration.value, extracted.values, residuals),
				});
				continue;
			}
			if (node.type === "rule") {
				const rule = node as Rule;
				if (rule.selector.includes("__PANDWIND_INTERPOLATION_")) {
					residuals.push({
						kind: "dynamic",
						text: rule.selector,
						hint: "dynamic selectors require a host-specific lowering",
					});
					continue;
				}
				const nested = parseContainer(rule, conditions);
				children.push({
					kind: "style",
					selector: normalizeNestedSelector(rule.selector),
					conditions,
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				continue;
			}
			if (node.type !== "atrule") continue;
			const atRule = node as AtRule;
			const name = atRule.name.toLowerCase();
			if (name === "media" || name === "container") {
				if (atRule.params.includes("__PANDWIND_INTERPOLATION_")) {
					residuals.push({
						kind: "dynamic",
						text: atRule.params,
						hint: "dynamic media/container conditions require a runtime template fallback",
					});
					continue;
				}
				const nestedConditions = [
					...conditions,
					{ kind: name, name: atRule.params, value: atRule.params },
				] as const;
				const nested = parseContainer(atRule, nestedConditions);
				if (nested.declarations.length > 0) {
					children.push({
						kind: "style",
						conditions: nestedConditions,
						declarations: nested.declarations,
						children: [],
						order: order++,
					});
				}
				children.push(...nested.children);
				continue;
			}
			if (name === "supports") {
				const nested = parseContainer(atRule, conditions);
				children.push({
					kind: "supports",
					name: atRule.params,
					conditions,
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				continue;
			}
			if (name === "layer") {
				const nested = parseContainer(atRule, conditions);
				children.push({
					kind: "layer",
					layer: atRule.params || undefined,
					conditions,
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				continue;
			}
			if (name === "font-face" || name === "property") {
				const nested = parseContainer(atRule, []);
				children.push({
					kind: name === "font-face" ? "font-face" : "property",
					...(name === "property" ? { name: atRule.params } : {}),
					conditions,
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				continue;
			}
			if (name === "keyframes" || name === "-webkit-keyframes") {
				const nested = parseContainer(atRule, []);
				children.push({
					kind: "keyframes",
					name: atRule.params,
					conditions,
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				continue;
			}
			residuals.push({
				kind: "parse",
				text: atRule.toString(),
				hint: `${adapter} does not support @${name} in template CSS`,
			});
		}
		return { declarations, children };
	};
	const parsed = parseContainer(root);
	const conditionalDeclarations = extracted.values.flatMap((value) => {
		const fragment = value.conditionalFragment;
		const declaration =
			fragment === undefined ? undefined : conditionalFragmentDeclaration(fragment);
		return declaration === undefined || fragment === undefined
			? []
			: [
					{
						conditions: [],
						property: camelProperty(declaration.prop),
						value: {
							kind: "dynamic" as const,
							expression: `(${fragment.parameter}) => (${fragment.condition}) ? ${JSON.stringify(declaration.value.trim())} : undefined`,
							lowering: "custom-property" as const,
						},
					},
				];
	});
	return styleProgramFromRules(
		[
			{
				kind: "style",
				conditions: [],
				declarations: [...parsed.declarations, ...conditionalDeclarations],
				children: parsed.children,
				order: 0,
			},
		],
		{
			source: {
				file: context.file,
				start,
				adapter,
				template: templateBody,
				...(context.document?.framework ? { framework: context.document.framework } : {}),
			},
			residuals,
		},
	);
}
