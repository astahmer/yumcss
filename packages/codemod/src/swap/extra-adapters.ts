import type {
	AdapterDependencies,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	StyleAdapter,
} from "./adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import { ADAPTER_CONTRACT_SCHEMA } from "./adapter-contract.ts";
import {
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";

type ExtraAdapterOptions = {
	id: string;
	modules: readonly string[];
	packages: AdapterDependencies;
	detect: readonly RegExp[];
	call: RegExp;
	form?: "object" | "template";
	prefix: string;
	suffix?: string;
	namedObjects?: boolean;
};

const capabilities = (id: string): AdapterCapabilities => ({
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter: id,
	version: "1",
	capabilities: {
		declarations: "exact",
		"rule-level": "partial",
		"named-conditions": "exact",
		"pseudo-conditions": "exact",
		"selector-conditions": "exact",
		"media-conditions": "exact",
		"supports-conditions": "exact",
		"dynamic-values": "partial",
		components: "partial",
	},
});

const config = (id: string, context: { root?: string; file: string }): AdapterProjectConfig => ({
	adapter: id,
	root: context.root,
	files: [context.file],
	values: {},
});

const valueText = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
};

type ObjectNode = { values: Array<[string, string]>; children: Map<string, ObjectNode> };

const renderObjectNode = (node: ObjectNode): string => {
	const values = node.values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
	const children = [...node.children].map(
		([key, child]) => `${JSON.stringify(key)}: ${renderObjectNode(child)}`,
	);
	return `{ ${[...values, ...children].join(", ")} }`;
};

const objectText = (program: StyleProgram): string => {
	const root: ObjectNode = { values: [], children: new Map() };
	const add = (
		node: ObjectNode,
		declaration: StyleProgram["declarations"][number],
		index: number,
	): void => {
		const condition = declaration.conditions[index];
		if (condition === undefined) {
			node.values.push([declaration.property, valueText(declaration.value)]);
			return;
		}
		const key = condition.raw ?? condition.value ?? condition.name;
		const child = node.children.get(key) ?? { values: [], children: new Map() };
		node.children.set(key, child);
		add(child, declaration, index + 1);
	};
	const declarations = program.rules[0]?.declarations ?? program.declarations;
	for (const declaration of declarations) add(root, declaration, 0);
	return renderObjectNode(root);
};

function balanced(source: string, open: number): { end: number; body: string } | undefined {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === "{") depth++;
		if (source[index] === "}") {
			depth--;
			if (depth === 0) return { end: index + 1, body: source.slice(open + 1, index) };
		}
	}
	return undefined;
}

function parseObjectCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const mask = context.document?.isExcluded ?? (() => false);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	for (const match of source.matchAll(options.call)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const open = source.indexOf("{", start);
		const block = balanced(source, open);
		if (block === undefined) {
			residuals.push({
				kind: "parse",
				text: source.slice(start),
				hint: `${id} object is unbalanced`,
			});
			continue;
		}
		const program = styleProgramFromSourceObject(block.body, {
			source: { file: context.file, start, end: block.end, adapter: id },
			sourceOffset: open + 1,
			...(options.namedObjects ? { nestedObjectKind: "named" as const } : {}),
		});
		let end = block.end;
		// Fela commonly wraps rule objects in `() => ({ ... })`; consume the
		// wrapper closers so replacing the complete call cannot leave invalid JS.
		while (source[end] === ")") end++;
		matches.push({ start, end, program, sourceText: source.slice(start, end) });
	}
	return { matches, residuals };
}

function camelProperty(property: string): string {
	return property
		.trim()
		.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function parseTemplateCalls(
	id: string,
	source: string,
	context: AdapterParseContext,
	options: ExtraAdapterOptions,
): AdapterParseResult {
	const mask = context.document?.isExcluded ?? (() => false);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	for (const match of source.matchAll(options.call)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const template = match[0];
		const firstTick = template.indexOf("`");
		const lastTick = template.lastIndexOf("`");
		if (firstTick === -1 || lastTick <= firstTick) continue;
		const body = template.slice(firstTick + 1, lastTick);
		const declarations: StyleProgram["declarations"][number][] = [];
		const programResiduals: StyleProgramResidual[] = [];
		if (body.includes("${")) {
			const residual = {
				kind: "dynamic",
				text: body,
				hint: `${id} template interpolation requires a runtime-aware lowering`,
			} satisfies StyleProgramResidual;
			programResiduals.push(residual);
			residuals.push(residual);
		} else {
			for (const statement of body.split(";")) {
				const trimmed = statement.replace(/\/\*.*?\*\//gs, "").trim();
				if (trimmed === "") continue;
				const colon = trimmed.indexOf(":");
				if (colon <= 0) {
					const residual = {
						kind: "parse",
						text: statement,
						hint: `${id} nested template CSS requires a rule parser`,
					} satisfies StyleProgramResidual;
					programResiduals.push(residual);
					residuals.push(residual);
					break;
				}
				declarations.push({
					conditions: [],
					property: camelProperty(trimmed.slice(0, colon)),
					value: { kind: "literal", value: trimmed.slice(colon + 1).trim() },
				});
			}
		}
		const program: StyleProgram = {
			schema: "pandwind.style-program/3",
			rules: [
				{
					kind: "style",
					conditions: [],
					declarations,
					children: [],
					order: 0,
				},
			],
			declarations,
			residuals: programResiduals,
			source: { file: context.file, start, end: start + template.length, adapter: id },
		};
		matches.push({ start, end: start + template.length, program, sourceText: template });
	}
	return { matches, residuals };
}

const makeAdapter = (options: ExtraAdapterOptions): StyleAdapter => ({
	schema: ADAPTER_CONTRACT_SCHEMA,
	id: options.id,
	version: "2",
	sourceModules: options.modules,
	capabilities: capabilities(options.id),
	dependencies: options.packages,
	detect: (context) => {
		const evidence = options.detect.flatMap((pattern) => {
			pattern.lastIndex = 0;
			const matched = pattern.test(context.source);
			pattern.lastIndex = 0;
			return matched ? [pattern.source] : [];
		});
		return { matched: evidence.length > 0, confidence: evidence.length ? 0.8 : 0, evidence };
	},
	loadConfig: (context) => config(options.id, context),
	parse: (source, context) =>
		options.form === "template"
			? parseTemplateCalls(options.id, source, context, options)
			: parseObjectCalls(options.id, source, context, options),
	emit: (program) => ({
		text: `${options.prefix}${objectText(program)}${options.suffix ?? ""}`,
		residuals: [...program.residuals],
		dependencies: options.packages,
	}),
	validate: (source, target, residuals = []) => {
		const canonicalSource = styleProgramToCanonicalCss(source);
		const canonicalTarget = styleProgramToCanonicalCss(target);
		const differences = canonicalSource === canonicalTarget ? [] : ["canonical CSS differs"];
		if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
		return {
			valid: differences.length === 0,
			lossiness:
				differences.length === 0
					? "lossless"
					: canonicalSource === canonicalTarget
						? "lossy"
						: "unsupported",
			canonicalSource,
			canonicalTarget,
			differences,
			residuals,
		};
	},
});

export const FELA = makeAdapter({
	id: "fela",
	modules: ["fela", "react-fela"],
	packages: {
		packages: [
			{ name: "fela", kind: "runtime" },
			{ name: "react-fela", kind: "peer" },
		],
	},
	detect: [/from\s+["'](?:fela|react-fela)["']/g, /\brenderer\.renderRule\s*\(\s*\{/g],
	call: /\brenderer\.renderRule\s*\(\s*(?:\(\)\s*=>\s*)?\(?\{/g,
	prefix: "renderer.renderRule(",
});

export const GOOBER = makeAdapter({
	id: "goober",
	modules: ["goober"],
	packages: { packages: [{ name: "goober", kind: "runtime" }] },
	detect: [/from\s+["']goober["']/g, /\bcss\s*\(\s*\{/g],
	call: /\bcss\s*\(\s*\{/g,
	prefix: "css(",
});

export const APHRODITE = makeAdapter({
	id: "aphrodite",
	modules: ["aphrodite"],
	packages: { packages: [{ name: "aphrodite", kind: "runtime" }] },
	detect: [/from\s+["']aphrodite["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	namedObjects: true,
});

export const STYLE9 = makeAdapter({
	id: "style9",
	modules: ["style9"],
	packages: { packages: [{ name: "style9", kind: "runtime" }] },
	detect: [/from\s+["']style9["']/g, /\bstyle9\.create\s*\(\s*\{/g],
	call: /\bstyle9\.create\s*\(\s*\{/g,
	prefix: "style9.create(",
	namedObjects: true,
});

export const TREAT = makeAdapter({
	id: "treat",
	modules: ["@/styles.treat", "treat"],
	packages: { packages: [{ name: "treat", kind: "development" }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
});

export const COMPILED = makeAdapter({
	id: "compiled",
	modules: ["@compiled/react", "@compiled/css-in-js"],
	packages: { packages: [{ name: "@compiled/react", kind: "peer" }] },
	detect: [
		/from\s+["']@compiled\/(?:react|css-in-js)["']/g,
		/\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(/g,
	],
	call: /\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(\s*\{/g,
	prefix: "css(",
});

export const SOLID_STYLED = makeAdapter({
	id: "solid-styled",
	modules: ["solid-styled-components"],
	packages: { packages: [{ name: "solid-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["']solid-styled-components["']/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`/g,
	],
	call: /\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
});

export const VUE_STYLED = makeAdapter({
	id: "vue-styled",
	modules: ["vue-styled-components"],
	packages: { packages: [{ name: "vue-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["'](?:vue-styled-components|@vue-styled-components\/core)["']/g,
		/\bstyled\.[A-Za-z_$][\w$]*[^`]*`/g,
	],
	call: /\bstyled\.[A-Za-z_$][\w$]*[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
});

export const REACT_NATIVE = makeAdapter({
	id: "react-native",
	modules: ["react-native"],
	packages: { packages: [{ name: "react-native", kind: "peer" }] },
	detect: [/from\s+["']react-native["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	namedObjects: true,
});

/** Independently owned adapters added without modifying existing library adapters. */
export const EXTRA_ADAPTERS: readonly StyleAdapter[] = [
	FELA,
	GOOBER,
	APHRODITE,
	STYLE9,
	TREAT,
	COMPILED,
	SOLID_STYLED,
	VUE_STYLED,
	REACT_NATIVE,
];
