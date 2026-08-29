import type { AdapterParseContext } from "./adapter-contract.ts";
import type { AdapterSourceObjectOptions } from "./external-adapters.ts";
import {
	styleProgramFromRules,
	styleProgramFromSourceObject,
	type StyleDeclaration,
	type StyleProgram,
} from "./semantic-ir.ts";
import { parseAdapterTemplate } from "./adapter-template-parser.ts";
import { CodemodAdapterSupport } from "./adapter-support.ts";

function conditionKey(condition: StyleProgram["rules"][number]["conditions"][number]): string {
	if (condition.raw !== undefined) {
		if (condition.raw.startsWith("_")) return `&:${condition.raw.slice(1)}`;
		return condition.raw;
	}
	if (condition.kind === "pseudo")
		return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
	if (condition.kind === "media")
		return condition.value === undefined ? condition.name : `@media ${condition.value}`;
	if (condition.kind === "container")
		return condition.value === undefined ? condition.name : `@container ${condition.value}`;
	if (condition.kind === "supports")
		return condition.value === undefined ? condition.name : `@supports ${condition.value}`;
	if (condition.kind === "selector") {
		if (condition.name.endsWith(" &")) return `&${condition.name.slice(0, -2)}`;
		if (!condition.name.includes("&"))
			return condition.name.startsWith(":") || condition.name.startsWith("[")
				? `&${condition.name}`
				: condition.name;
	}
	return condition.name;
}

type ObjectNode = { entries: Array<[string, string]>; children: Array<[string, ObjectNode]> };

function objectNode(): ObjectNode {
	return { entries: [], children: [] };
}

function renderValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function renderKey(key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderObjectNode(node: ObjectNode): string {
	const entries = node.entries.map(([key, value]) => `${renderKey(key)}: ${value}`);
	const children = node.children.map(
		([key, child]) => `${renderKey(key)}: ${renderObjectNode(child)}`,
	);
	return `{ ${[...entries, ...children].join(", ")} }`;
}

function addDeclaration(
	node: ObjectNode,
	declaration: StyleDeclaration,
	conditions: readonly string[],
): void {
	if (conditions.length === 0) {
		node.entries.push([declaration.property, renderValue(declaration.value)]);
		return;
	}
	const key = conditions[0]!;
	let child = node.children.find(([candidate]) => candidate === key)?.[1];
	if (child === undefined) {
		child = objectNode();
		node.children.push([key, child]);
	}
	addDeclaration(child, declaration, conditions.slice(1));
}

function declarationsObject(declarations: readonly StyleDeclaration[]): string {
	const root = objectNode();
	for (const declaration of declarations) {
		addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
	}
	return renderObjectNode(root);
}

function styleRuleNode(rule: StyleProgram["rules"][number]): ObjectNode {
	const root = objectNode();
	for (const declaration of rule.declarations)
		addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
	for (const child of rule.children) {
		let target = root;
		for (const condition of child.conditions.map(conditionKey)) {
			let conditionNode = target.children.find(([key]) => key === condition)?.[1];
			if (conditionNode === undefined) {
				conditionNode = objectNode();
				target.children.push([condition, conditionNode]);
			}
			target = conditionNode;
		}
		const childNode = styleRuleNode({ ...child, conditions: [] });
		if (child.kind === "style" && child.selector === undefined) {
			target.entries.push(...childNode.entries);
			target.children.push(...childNode.children);
			continue;
		}
		const key =
			child.selector ??
			(child.kind === "supports"
				? `@supports ${child.name ?? ""}`
				: child.kind === "layer"
					? `@layer ${child.layer ?? child.name ?? ""}`
					: (child.name ?? child.kind));
		target.children.push([key, childNode]);
	}
	return root;
}

function ruleObject(rule: StyleProgram["rules"][number]): string {
	if (rule.kind === "style" || rule.kind === "font-face" || rule.kind === "property") {
		return renderObjectNode(styleRuleNode(rule));
	}
	if (rule.kind === "global") {
		return `{ ${JSON.stringify(rule.selector ?? "*")}: ${declarationsObject(rule.declarations)} }`;
	}
	if (rule.kind === "keyframes") {
		return `{ ${rule.children
			.map(
				(child) =>
					`${JSON.stringify(child.selector ?? "from")}: ${declarationsObject(child.declarations)}`,
			)
			.join(", ")} }`;
	}
	const body = declarationsObject(rule.declarations);
	const prefix =
		rule.kind === "layer"
			? `@layer ${rule.layer ?? rule.name ?? ""}`
			: `@supports ${rule.name ?? ""}`;
	return `{ ${JSON.stringify(prefix)}: ${body} }`;
}

function programObject(program: StyleProgram): string {
	if (program.rules.length === 1) return ruleObject(program.rules[0]!);
	if (program.rules.every((rule) => rule.kind === "global")) {
		const root = objectNode();
		for (const rule of program.rules) {
			root.entries.push([rule.selector ?? "*", declarationsObject(rule.declarations)]);
		}
		return renderObjectNode(root);
	}
	const root = objectNode();
	for (const rule of program.rules) {
		if (rule.kind === "style") {
			for (const declaration of rule.declarations) {
				addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
			}
		} else {
			root.entries.push([rule.selector ?? rule.name ?? rule.kind, ruleObject(rule)]);
		}
	}
	return renderObjectNode(root);
}

function firstKind(program: StyleProgram): StyleProgram["rules"][number]["kind"] {
	return program.rules[0]?.kind ?? "style";
}

function parseKeyframeProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
	sourceObjectOptions: AdapterSourceObjectOptions = {},
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		...sourceObjectOptions,
		nestedObjectKind: "selector",
		source: CodemodAdapterSupport.source(context, start),
		conditionKinds: { from: "selector", to: "selector" },
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "from";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: [] });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[
			{
				kind: "keyframes",
				name,
				conditions: [],
				declarations: [],
				children: [...groups].map(([selector, declarations], order) => ({
					kind: "style" as const,
					selector,
					conditions: [],
					declarations,
					children: [],
					order,
				})),
				order: 0,
			},
		],
		{
			source: CodemodAdapterSupport.source(context, start),
			residuals: base.residuals,
		},
	);
}

function parseGlobalProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: CodemodAdapterSupport.source(context, start),
		nestedObjectKind: "selector",
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "*";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: declaration.conditions.slice(1) });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[...groups].map(([selector, declarations], order) => ({
			kind: "global" as const,
			selector,
			conditions: [],
			declarations,
			children: [],
			order,
		})),
		{
			source: CodemodAdapterSupport.source(context, start),
			residuals: base.residuals,
		},
	);
}

function parseTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	return parseAdapterTemplate(body, context, context.config.adapter, start);
}

function kebabProperty(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Emit the static subset as authored CSS for template-based adapters. */
const templateValue = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return value.authored;
	return String(value.value);
};

function templateCss(program: StyleProgram): string {
	const renderRule = (rule: StyleProgram["rules"][number]): string => {
		const declarations = rule.declarations
			.filter((declaration) => declaration.conditions.length === 0)
			.map(
				(declaration) =>
					`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)};`,
			)
			.join(" ");
		const nested = rule.children.map(renderRule).join(" ");
		if (rule.kind !== "style") return `${declarations}${nested}`;
		const base = declarations === "" ? nested : `${declarations}${nested}`;
		return base;
	};
	return program.rules.map(renderRule).join(" ");
}

export const CodemodAdapterRenderer = {
	firstKind,
	programObject,
	declarationsObject,
	templateCss,
} as const;

export const CodemodAdapterParser = {
	parseKeyframeProgram,
	parseGlobalProgram,
	parseTemplateProgram,
} as const;
