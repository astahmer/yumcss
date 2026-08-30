import { dirname, resolve } from "node:path";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { CodemodAdapterId } from "../identifiers.ts";
import { matchBlock } from "../../source-pass-utils.ts";

function projectConfigEvidence(context: {
	readonly file: string;
	readonly root?: string;
	readonly readFile?: (file: string) => string | undefined;
}): readonly string[] {
	if (context.readFile === undefined) return [];
	const root = context.root === undefined ? undefined : resolve(context.root);
	const file = context.file.startsWith("/")
		? context.file
		: root === undefined
			? undefined
			: resolve(root, context.file);
	let directory = file === undefined ? undefined : dirname(file);
	if (directory === undefined) return [];
	const evidence: string[] = [];
	while (directory !== undefined) {
		for (const file of [".babelrc", ".babelrc.js", "babel.config.js", "tsconfig.json"]) {
			const path = `${directory}/${file}`;
			const source = context.readFile(path);
			if (source?.includes("@emotion/react") === true) evidence.push(path);
		}
		if (directory === root) break;
		const parent = directory.slice(0, directory.lastIndexOf("/"));
		if (parent === directory) break;
		directory = parent || undefined;
	}
	return evidence;
}

interface EmotionFileContext {
	readonly file: string;
	readonly root?: string;
	readonly readFile?: (file: string) => string | undefined;
}

function importedModulePath(specifier: string, context: EmotionFileContext): string | undefined {
	if (context.readFile === undefined || !specifier.startsWith(".")) return undefined;
	const sourceFile = context.file.startsWith("/")
		? context.file
		: context.root === undefined
			? undefined
			: resolve(context.root, context.file);
	if (sourceFile === undefined) return undefined;
	const modulePath = resolve(dirname(sourceFile), specifier);
	const extensions = ["", ".ts", ".tsx", ".js", ".jsx"];
	for (const extension of extensions) {
		const file = modulePath + extension;
		if (context.readFile(file) !== undefined) return file;
	}
	for (const extension of extensions.slice(1)) {
		const file = modulePath + "/index" + extension;
		if (context.readFile(file) !== undefined) return file;
	}
	return undefined;
}

function staticObjectValues(
	source: string,
	name: string,
	context?: EmotionFileContext,
	sourceFile?: string,
): Readonly<Record<string, string>> {
	const declaration = new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\{`).exec(
		source,
	);
	if (declaration === null && context !== undefined) {
		const reexport = source.match(/export\s+\*\s+from\s+["']([^"']+)["']/);
		const file =
			reexport?.[1] === undefined
				? undefined
				: importedModulePath(reexport[1], {
						...context,
						...(sourceFile === undefined ? {} : { file: sourceFile }),
					});
		const imported = file === undefined ? undefined : context.readFile?.(file);
		if (imported !== undefined) return staticObjectValues(imported, name, context, file);
	}
	if (declaration === null) return {};
	const open = declaration.index + declaration[0].lastIndexOf("{");
	const block = matchBlock(source, open);
	if (block === null) return {};
	const numericValues = Object.fromEntries(
		[...source.matchAll(/(?:^|[,{])\s*(\w+)\s*:\s*(\d+(?:\.\d+)?)/gm)].map((match) => [
			match[1],
			match[2],
		]),
	);
	const values: Record<string, string> = {};
	for (const match of block.body.matchAll(
		/([A-Za-z_$][\w$]*)\s*:\s*(?:(["'])(.*?)\2|`([^\`]*)`)/gs,
	)) {
		const key = match[1];
		const value = match[3] ?? match[4];
		if (key === undefined || value === undefined) continue;
		values[key] = value.replace(
			/\$\{([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\}/g,
			(_expression, object, property) =>
				numericValues[object + "." + property] ?? numericValues[property] ?? "",
		);
	}
	return values;
}

function staticNamedObjectValues(
	source: string,
	name: string,
	context: EmotionFileContext,
	sourceFile: string,
	visited = new Set<string>(),
): Readonly<Record<string, string>> {
	if (visited.has(sourceFile)) return {};
	const nextVisited = new Set(visited).add(sourceFile);
	const local = staticObjectValues(source, name, context, sourceFile);
	if (Object.keys(local).length > 0) return local;
	for (const match of source.matchAll(/export\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
		const bindings = match[1];
		const specifier = match[2];
		if (bindings === undefined || specifier === undefined) continue;
		for (const binding of bindings.split(",")) {
			const [original, exported = original] = binding.trim().split(/\s+as\s+/);
			if (original !== name && exported !== name) continue;
			const importedFile = importedModulePath(specifier, { ...context, file: sourceFile });
			const imported = importedFile === undefined ? undefined : context.readFile?.(importedFile);
			if (imported !== undefined && importedFile !== undefined)
				return staticNamedObjectValues(imported, original!, context, importedFile, nextVisited);
		}
	}
	for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
		const specifier = match[1];
		if (specifier === undefined) continue;
		const importedFile = importedModulePath(specifier, { ...context, file: sourceFile });
		const imported = importedFile === undefined ? undefined : context.readFile?.(importedFile);
		if (imported !== undefined && importedFile !== undefined) {
			const values = staticNamedObjectValues(imported, name, context, importedFile, nextVisited);
			if (Object.keys(values).length > 0) return values;
		}
	}
	return {};
}

function importedStaticValues(
	source: string,
	context: EmotionFileContext,
): Readonly<Record<string, string>> {
	const values: Record<string, string> = {};
	for (const importMatch of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
		const bindings = importMatch[1];
		const specifier = importMatch[2];
		if (bindings === undefined || specifier === undefined) continue;
		const importedFile = importedModulePath(specifier, context);
		const imported = importedFile === undefined ? undefined : context.readFile?.(importedFile);
		if (imported === undefined || importedFile === undefined) continue;
		for (const binding of bindings.split(",")) {
			const [original, local = original] = binding.trim().split(/\s+as\s+/);
			if (original === undefined || local === undefined) continue;
			for (const [property, value] of Object.entries(
				staticNamedObjectValues(imported, original, context, importedFile),
			))
				values[`${local}.${property}`] = value;
		}
	}
	return values;
}

function importedComputedKeys(
	source: string,
	context: {
		readonly file: string;
		readonly root?: string;
		readonly readFile?: (file: string) => string | undefined;
	},
): Readonly<Record<string, string>> {
	const computedKeys: Record<string, string> = {};
	for (const importMatch of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
		const bindings = importMatch[1];
		const specifier = importMatch[2];
		if (bindings === undefined || specifier === undefined) continue;
		const importedFile = importedModulePath(specifier, context);
		const imported = importedFile === undefined ? undefined : context.readFile?.(importedFile);
		if (imported === undefined) continue;
		for (const binding of bindings.split(",")) {
			const [original, local = original] = binding.trim().split(/\s+as\s+/);
			if (original === undefined || local === undefined) continue;
			const values = staticObjectValues(imported, original, context, importedFile);
			for (const [property, value] of Object.entries(values))
				if (new RegExp(`\\[\\s*${local}\\.${property}\\s*\\]`).test(source))
					computedKeys[`${local}.${property}`] = value;
		}
	}
	return computedKeys;
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Emotion,
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "css-template", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g,
		},
		{
			name: "styled-template",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "global", kind: "global", regex: /\b(?:injectGlobal|global)\s*\(\s*\{/g },
		{
			name: "emotion-css-prop",
			regex: /<[A-Za-z_$][\w$.-]*(?:\s|>)/g,
			form: "jsx-style",
			styleProps: ["css"],
		},
	],
	packages: {
		packages: [
			{ name: "@emotion/css", kind: "runtime" },
			{ name: "@emotion/styled", kind: "peer" },
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Emotion, "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/],
	sourceModules: ["@emotion/css", "@emotion/react", "@emotion/styled"],
	configFiles: [".emotionrc", "emotion.config.js", "package.json"],
	sourceObjectOptions: (source, context) => ({
		nestedObjectKind: "selector",
		computedKeys: importedComputedKeys(source, context),
		dynamicReferences: importedStaticValues(source, context),
	}),
	migration: {
		rewrite: ({ code, targetId }) => {
			if (targetId !== CodemodAdapterId.Pandwind) return { code, residuals: [] };
			const edits: Array<{ start: number; end: number; text: string }> = [];
			for (const match of code.matchAll(/<Global\b/g)) {
				const start = match.index ?? 0;
				const styles = code.indexOf("styles={", start + match[0].length);
				if (styles < 0) continue;
				const block = matchBlock(code, styles + "styles=".length);
				if (block === null) continue;
				const end = code.indexOf("/>", block.end);
				if (end < 0) continue;
				edits.push({ start, end: end + 2, text: "<></>" });
			}
			return { code: edits.length === 0 ? code : applyTextEdits(code, edits), residuals: [] };
		},
	},
	detect(context) {
		const explicit = [/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/].find(
			(pattern) => pattern.test(context.source),
		);
		if (explicit !== undefined)
			return {
				matched: true,
				confidence: 1,
				evidence: [`source:${explicit.source}`],
			};
		const config = projectConfigEvidence(context);
		if (config.length > 0 && /\bcss\s*=|\bGlobal\b|\bstyled\b/.test(context.source))
			return {
				matched: true,
				confidence: 0.95,
				evidence: config.map((file) => `config:${file}`),
			};
		return { matched: false, confidence: 0, evidence: [] };
	},
	emit(program, { firstKind, programObject }) {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@emotion/css";'],
			};
		if (kind === "global")
			return {
				text: `injectGlobal(${programObject(program)})`,
				imports: ['import { injectGlobal } from "@emotion/css";'],
			};
		if (program.source?.subject !== undefined)
			return {
				text: `${program.source.subject}(${programObject(program)})`,
				imports: ['import styled from "@emotion/styled";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
});

function applyTextEdits(
	source: string,
	edits: readonly { start: number; end: number; text: string }[],
): string {
	return edits
		.toSorted((a, b) => b.start - a.start)
		.reduce(
			(result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
			source,
		);
}
