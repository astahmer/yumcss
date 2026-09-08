import { NodeKind } from "../ast-node-kind.ts";
import { identifierName, memberName } from "./ast-walk.ts";
import { walk, type OxcNode } from "../tw/literal.ts";

/** The Pandwind RSD carrier is an explicit CSS source, independent of basenames. */
const REACT_STRICT_DOM_SOURCE = "pandwind/react-strict-dom" as const;
const REACT_STRICT_DOM_NATIVE_PLATFORM = "native" as const;
const REACT_STRICT_DOM_NATIVE_MEMBER = "Native" as const;

interface ImportDeclaration extends OxcNode {
	source?: { value?: string };
	specifiers?: Array<{
		type?: string;
		imported?: { name?: string };
		local?: { name?: string };
	}>;
}

interface CallExpression extends OxcNode {
	callee?: OxcNode | null;
	arguments?: unknown[];
}

interface MemberExpression extends OxcNode {
	object?: OxcNode | null;
	property?: { name?: string } | null;
}

interface VariableDeclarator extends OxcNode {
	id?: OxcNode;
	init?: OxcNode | null;
}

export interface ReactStrictDomBindings {
	readonly createCssNames: ReadonlySet<string>;
	readonly nativePlatformNames: ReadonlySet<string>;
	readonly cssNames: ReadonlySet<string>;
}

const isNativePlatformValue = (
	node: OxcNode | null | undefined,
	nativePlatformNames: ReadonlySet<string>,
): boolean => {
	if (node?.type === NodeKind.Literal)
		return (node as { value?: unknown }).value === REACT_STRICT_DOM_NATIVE_PLATFORM;
	if (node?.type !== NodeKind.MemberExpression) return false;
	const member = node as MemberExpression;
	return (
		identifierName(member.object) !== undefined &&
		nativePlatformNames.has(identifierName(member.object)!) &&
		memberName(node) === REACT_STRICT_DOM_NATIVE_MEMBER
	);
};

const isNativeCreate = (
	call: CallExpression,
	nativePlatformNames: ReadonlySet<string>,
): boolean => {
	const firstArgument = call.arguments?.[0];
	if (!firstArgument || (firstArgument as OxcNode).type !== NodeKind.ObjectExpression) return false;
	for (const property of (
		firstArgument as { properties?: Array<{ key?: OxcNode; value?: OxcNode }> }
	).properties ?? []) {
		if (identifierName(property.key) !== "platform") continue;
		return isNativePlatformValue(property.value, nativePlatformNames);
	}
	return false;
};

/** Resolve the RSD `createCss()` bindings that can contribute to web CSS. */
export const findReactStrictDomBindings = (program: OxcNode): ReactStrictDomBindings => {
	const createCssNames = new Set<string>();
	const nativePlatformNames = new Set<string>();

	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportDeclaration;
		if (declaration.source?.value !== REACT_STRICT_DOM_SOURCE) return;
		for (const specifier of declaration.specifiers ?? []) {
			if (specifier.type !== NodeKind.ImportSpecifier) continue;
			const imported = specifier.imported?.name;
			const local = specifier.local?.name;
			if (local === undefined) continue;
			if (imported === "createCss") createCssNames.add(local);
			if (imported === "ReactStrictDomPlatform") nativePlatformNames.add(local);
		}
	});

	const cssNames = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const declaration = node as VariableDeclarator;
		const binding = identifierName(declaration.id);
		const init = declaration.init;
		if (binding === undefined || init?.type !== NodeKind.CallExpression) return;
		const call = init as CallExpression;
		if (!createCssNames.has(identifierName(call.callee)!)) return;
		if (!isNativeCreate(call, nativePlatformNames)) cssNames.add(binding);
	});

	return { createCssNames, nativePlatformNames, cssNames };
};

/** True for the named style-map carrier exposed by an RSD `createCss()` value. */
export const isReactStrictDomCreateCall = (
	callee: OxcNode | null | undefined,
	cssNames: ReadonlySet<string>,
): boolean => {
	if (callee?.type !== NodeKind.MemberExpression) return false;
	const member = callee as MemberExpression;
	return (
		identifierName(member.object) !== undefined &&
		cssNames.has(identifierName(member.object)!) &&
		memberName(callee) === "create"
	);
};
