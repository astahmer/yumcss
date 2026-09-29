import {
	SemanticConditionKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	type StyleDeclaration,
	type StyleProgram,
} from "./semantic-ir.ts";
import type { AdapterRenderers } from "./external-adapters.ts";

function conditionKey(condition: StyleProgram["rules"][number]["conditions"][number]): string {
	if (condition.kind === SemanticConditionKindTag.Named && condition.name === "base") return "";
	// A raw source key such as Panda's `_dark` is only a fallback. When the
	// official source config supplied a resolved selector, the resolved value
	// is the semantic condition that must reach the target stylesheet.
	if (condition.raw !== undefined && condition.value === undefined) {
		if (condition.raw.startsWith("_")) return `&:${condition.raw.slice(1)}`;
		return condition.raw;
	}
	if (
		(condition.kind === SemanticConditionKindTag.Media ||
			condition.kind === SemanticConditionKindTag.Container ||
			condition.kind === SemanticConditionKindTag.Supports ||
			condition.kind === SemanticConditionKindTag.Pseudo ||
			condition.kind === SemanticConditionKindTag.Selector) &&
		condition.name.startsWith("_") &&
		condition.value !== undefined
	)
		return condition.name;
	if (condition.kind === SemanticConditionKindTag.Pseudo)
		return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
	if (condition.kind === SemanticConditionKindTag.Media)
		return condition.value === undefined ? condition.name : `@media ${condition.value}`;
	if (condition.kind === SemanticConditionKindTag.Container)
		return condition.value === undefined ? condition.name : `@container ${condition.value}`;
	if (condition.kind === SemanticConditionKindTag.Supports)
		return condition.value === undefined ? condition.name : `@supports ${condition.value}`;
	if (condition.kind === SemanticConditionKindTag.Selector) {
		const selector = condition.value ?? condition.name;
		if (!selector.includes("&"))
			return selector.startsWith(":") || selector.startsWith("[") ? `&${selector}` : selector;
		return selector;
	}
	return condition.name;
}

type ObjectNode = { entries: Array<[string, string]>; children: Array<[string, ObjectNode]> };

function objectNode(): ObjectNode {
	return { entries: [], children: [] };
}

function renderValue(
	value: StyleProgram["declarations"][number]["value"],
	important = false,
): string {
	if (value.kind === StyleValueKindTag.Dynamic)
		return important ? `(${value.expression}) + " !important"` : value.expression;
	const resolved =
		value.kind === StyleValueKindTag.Token
			? important
				? (value.resolved ?? value.authored)
				: value.authored
			: value.value;
	return JSON.stringify(important ? `${String(resolved)} !important` : resolved);
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
	// UnoCSS uses `-Un*` marker properties while expanding utility groups. They
	// are compiler bookkeeping, never CSS declarations; the corresponding
	// standard property or custom property is emitted separately.
	if (/^-Un[A-Z]/u.test(declaration.property)) return;
	if (conditions.length === 0) {
		const entry: [string, string] = [
			declaration.property,
			renderValue(declaration.value, declaration.important),
		];
		const index = node.entries.findIndex(([property]) => property === declaration.property);
		if (index === -1) node.entries.push(entry);
		else node.entries[index] = entry;
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
		addDeclaration(
			root,
			declaration,
			declaration.conditions.map(conditionKey).filter((condition) => condition.length > 0),
		);
	}
	return renderObjectNode(root);
}

function styleRuleNode(rule: StyleProgram["rules"][number]): ObjectNode {
	const root = objectNode();
	for (const declaration of rule.declarations)
		addDeclaration(
			root,
			declaration,
			[...rule.conditions, ...declaration.conditions]
				.map(conditionKey)
				.filter((condition) => condition.length > 0),
		);
	for (const child of rule.children) {
		const key = child.selector ?? child.name ?? child.kind;
		root.children.push([key, styleRuleNode(child)]);
	}
	return root;
}

function ruleObject(rule: StyleProgram["rules"][number]): string {
	if (
		rule.kind === StyleRuleKindTag.Style ||
		rule.kind === StyleRuleKindTag.FontFace ||
		rule.kind === StyleRuleKindTag.Property
	) {
		return renderObjectNode(styleRuleNode(rule));
	}
	if (rule.kind === StyleRuleKindTag.Global) {
		return `{ ${JSON.stringify(rule.selector ?? "*")}: ${declarationsObject(rule.declarations)} }`;
	}
	if (rule.kind === StyleRuleKindTag.Keyframes) {
		return `{ ${rule.children
			.map(
				(child) =>
					`${JSON.stringify(child.selector ?? "from")}: ${declarationsObject(child.declarations)}`,
			)
			.join(", ")} }`;
	}
	const body = declarationsObject(rule.declarations);
	const prefix =
		rule.kind === StyleRuleKindTag.Layer
			? `@layer ${rule.layer ?? rule.name ?? ""}`
			: `@supports ${rule.name ?? ""}`;
	return `{ ${JSON.stringify(prefix)}: ${body} }`;
}

function programObject(program: StyleProgram): string {
	if (program.rules.length === 1) {
		const rule = program.rules[0]!;
		if (rule.kind === StyleRuleKindTag.Style && rule.name !== undefined)
			return `{ ${JSON.stringify(rule.name)}: ${ruleObject({ ...rule, name: undefined })} }`;
		return ruleObject(rule);
	}
	if (program.rules.every((rule) => rule.kind === StyleRuleKindTag.Global)) {
		const root = objectNode();
		for (const rule of program.rules) {
			root.entries.push([rule.selector ?? "*", declarationsObject(rule.declarations)]);
		}
		return renderObjectNode(root);
	}
	const root = objectNode();
	for (const rule of program.rules) {
		if (rule.kind === StyleRuleKindTag.Style && rule.name === undefined) {
			for (const declaration of rule.declarations) {
				addDeclaration(
					root,
					declaration,
					declaration.conditions.map(conditionKey).filter((condition) => condition.length > 0),
				);
			}
		} else if (rule.kind === StyleRuleKindTag.Style && rule.name !== undefined) {
			root.entries.push([rule.name, ruleObject(rule)]);
		} else {
			root.entries.push([rule.selector ?? rule.name ?? rule.kind, ruleObject(rule)]);
		}
	}
	return renderObjectNode(root);
}

function firstKind(program: StyleProgram): StyleProgram["rules"][number]["kind"] {
	return program.rules[0]?.kind ?? "style";
}

function kebabProperty(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Emit the static subset as authored CSS for template-based adapters. */
const templateValue = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === StyleValueKindTag.Dynamic) return `\${${value.expression}}`;
	if (value.kind === StyleValueKindTag.Token) return value.authored;
	return String(value.value);
};

function templateCss(program: StyleProgram): string {
	const conditionSelector = (
		condition: StyleProgram["rules"][number]["conditions"][number],
	): string => {
		if (
			condition.kind === SemanticConditionKindTag.Media ||
			condition.kind === SemanticConditionKindTag.Container ||
			condition.kind === SemanticConditionKindTag.Supports
		)
			return (condition.value ?? condition.name).startsWith(`@${condition.kind}`)
				? (condition.value ?? condition.name)
				: `@${condition.kind} ${condition.value ?? condition.name}`;
		if (condition.kind === SemanticConditionKindTag.Pseudo)
			return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
		const value = condition.value ?? condition.raw ?? condition.name;
		return value.includes("&") ? value : `&${value}`;
	};
	const wrap = (
		body: string,
		conditions: readonly StyleProgram["rules"][number]["conditions"][number][],
	): string =>
		conditions.reduceRight(
			(current, condition) => `${conditionSelector(condition)} { ${current} }`,
			body,
		);
	const renderRule = (rule: StyleProgram["rules"][number]): string => {
		const grouped = new Map<
			string,
			{ conditions: StyleProgram["rules"][number]["conditions"]; declarations: StyleDeclaration[] }
		>();
		for (const declaration of rule.declarations) {
			const key = JSON.stringify(declaration.conditions);
			const group = grouped.get(key) ?? { conditions: declaration.conditions, declarations: [] };
			group.declarations.push(declaration);
			grouped.set(key, group);
		}
		const declarations =
			grouped
				.get("[]")
				?.declarations.map(
					(declaration) =>
						`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)}${declaration.important ? " !important" : ""};`,
				)
				.join(" ") ?? "";
		const conditioned = [...grouped.values()]
			.filter((group) => group.conditions.length > 0)
			.map((group) =>
				wrap(
					group.declarations
						.map(
							(declaration) =>
								`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)}${declaration.important ? " !important" : ""};`,
						)
						.join(" "),
					group.conditions,
				),
			)
			.join(" ");
		const nested = rule.children.map(renderRule).join(" ");
		if (rule.kind === StyleRuleKindTag.Global) {
			const selector = rule.selector ?? "*";
			return `${selector} { ${declarations}${conditioned}${nested} }`;
		}
		if (rule.kind !== StyleRuleKindTag.Style) return `${declarations}${nested}`;
		const base = `${declarations}${conditioned}${nested}`;
		return base;
	};
	return program.rules.map(renderRule).join(" ");
}

export const AdapterRenderersImplementation: AdapterRenderers = {
	firstKind,
	programObject,
	declarationsObject,
	templateCss,
};
