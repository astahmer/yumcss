import { SOURCE_SCANNER_SERVICE, SourceBindings } from "yumcss/source";
import { NodeKind, type OxcNode, walk } from "yumcss/tw/literal";
import type { AdapterEmitContext } from "./adapter-contract.ts";

interface TargetImportBinding {
	readonly localName: string;
	readonly importRequired: boolean;
}

export const targetImportBinding = (input: {
	readonly context?: AdapterEmitContext;
	readonly source?: string;
	readonly file?: string;
	readonly importedName: string;
	readonly moduleSpecifier: string;
	readonly preserveSourceBindings: boolean;
	readonly preferred: string;
}): TargetImportBinding => {
	const source = input.context?.sourceText ?? input.source;
	if (source === undefined) return { localName: input.preferred, importRequired: true };
	const scanned = SOURCE_SCANNER_SERVICE.scan({
		file: input.context?.file ?? input.file ?? "migration.tsx",
		source,
	});
	if (scanned.program === undefined) return { localName: input.preferred, importRequired: true };
	const bindings = SourceBindings.fromProgram(scanned.program);
	const existingTargetBinding = bindings.bindings.find(
		(binding) =>
			binding.source === input.moduleSpecifier &&
			binding.importedName === input.importedName &&
			!bindings.isShadowed(binding.localName),
	);
	if (existingTargetBinding !== undefined)
		return { localName: existingTargetBinding.localName, importRequired: false };
	const sourceModules = new Set(input.context?.sourceModules ?? []);
	const sourceModuleMatchers = input.context?.sourceModuleMatchers ?? [];
	const isSourceModule = (specifier: string): boolean =>
		sourceModules.has(specifier) || sourceModuleMatchers.some((matches) => matches(specifier));
	const usedNames = new Set(bindings.declaredNames);
	for (const binding of bindings.bindings) {
		if (
			!input.preserveSourceBindings &&
			isSourceModule(binding.source) &&
			!sourceBindingHasOtherReferences(scanned.program, bindings, binding)
		)
			continue;
		usedNames.add(binding.localName);
	}
	if (!usedNames.has(input.preferred)) return { localName: input.preferred, importRequired: true };
	let binding = `__yumcss${input.preferred}`;
	let suffix = 2;
	while (usedNames.has(binding)) binding = `__yumcss${input.preferred}${suffix++}`;
	return { localName: binding, importRequired: true };
};

const sourceBindingHasOtherReferences = (
	program: OxcNode,
	bindings: ReturnType<typeof SourceBindings.fromProgram>,
	binding: (typeof bindings.bindings)[number],
): boolean => {
	const transformedCalleeStarts = new Set<number>();
	walk(program, (node) => {
		if (node.type !== NodeKind.CallExpression || typeof node.start !== "number") return;
		const end = (node as { end?: number }).end;
		const site = bindings.callSites.find(
			(candidate) =>
				candidate.kind === "call" &&
				candidate.start === node.start &&
				candidate.end === end &&
				candidate.binding === binding &&
				!bindings.isShadowedAt(binding.localName, candidate.start),
		);
		if (site === undefined) return;
		let callee = (node as { callee?: OxcNode }).callee;
		while (callee?.type === NodeKind.MemberExpression)
			callee = (callee as { object?: OxcNode }).object;
		if (
			callee?.type === NodeKind.Identifier &&
			typeof callee.start === "number" &&
			(callee as { name?: string }).name === binding.localName
		)
			transformedCalleeStarts.add(callee.start);
	});
	let usedElsewhere = false;
	walk(program, (node) => {
		if (
			usedElsewhere ||
			node.type !== NodeKind.Identifier ||
			(node as { name?: string }).name !== binding.localName ||
			typeof node.start !== "number" ||
			(node.start >= binding.range.start && node.start < binding.range.end)
		)
			return;
		if (!transformedCalleeStarts.has(node.start)) usedElsewhere = true;
	});
	return usedElsewhere;
};
