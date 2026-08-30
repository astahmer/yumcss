import { dirname, join, resolve } from "node:path";
import { allRuleCapabilities, defineCodemodAdapter } from "../external-adapters.ts";
import type {
	AdapterDetectionContext,
	AdapterDetectionResult,
	AdapterParseContext,
} from "../adapter-contract.ts";
import { CodemodAdapterId } from "../identifiers.ts";

function importedModulePath(context: AdapterParseContext, specifier: string): string {
	return `${resolve(context.root ?? ".", dirname(context.file), specifier)}.ts`;
}

function importedStaticValues(
	context: AdapterParseContext,
	text: string,
	seen = new Set<string>(),
): Readonly<Record<string, string>> {
	const values: Record<string, string> = {};
	for (const match of text.matchAll(/import\s*\{\s*([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
		const names =
			match[1]
				?.split(",")
				.map((name) => name.trim())
				.filter(Boolean) ?? [];
		const specifier = match[2];
		if (specifier === undefined) continue;
		const file = importedModulePath(context, specifier);
		if (seen.has(file)) continue;
		seen.add(file);
		const imported = context.readFile?.(file);
		if (imported === undefined) continue;
		for (const reexport of imported.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/g)) {
			const targetSpecifier = reexport[1];
			if (targetSpecifier === undefined) continue;
			const targetFile = `${resolve(dirname(file), targetSpecifier)}.ts`;
			if (seen.has(targetFile)) continue;
			seen.add(targetFile);
			const target = context.readFile?.(targetFile);
			if (target === undefined) continue;
			for (const object of target.matchAll(
				/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([\s\S]*?)\}/g,
			)) {
				const name = object[1];
				if (name === undefined || object[2] === undefined) continue;
				for (const property of object[2].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["']([^"']+)["']/g)) {
					if (property[1] !== undefined && property[2] !== undefined)
						values[`${name}.${property[1]}`] = property[2];
				}
			}
		}
		if (imported.includes("export *"))
			Object.assign(values, importedStaticValues(context, imported, seen));
		for (const name of names) {
			const object = new RegExp(
				`(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\}`,
			).exec(imported)?.[1];
			if (object === undefined) continue;
			for (const property of object.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["']([^"']+)["']/g)) {
				if (property[1] !== undefined && property[2] !== undefined)
					values[`${name}.${property[1]}`] = property[2];
			}
		}
	}
	return values;
}

function detectEmotion(
	context: AdapterDetectionContext,
	fallback: () => AdapterDetectionResult,
): AdapterDetectionResult {
	if (
		!/\bcss\s*=\s*\{/.test(context.source) ||
		context.root === undefined ||
		context.readFile === undefined
	)
		return fallback();
	let directory = resolve(context.root, dirname(context.file));
	const root = resolve(context.root);
	while (directory.startsWith(root)) {
		for (const candidate of [".babelrc.js", ".babelrc", "babel.config.js", "babel.config.cjs"]) {
			const file = join(directory, candidate);
			const config = context.readFile(file);
			if (config?.includes("@emotion/react") === true)
				return { matched: true, confidence: 0.95, evidence: [`config:${file}`] };
		}
		if (directory === root) break;
		directory = dirname(directory);
	}
	return fallback();
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Emotion,
	patterns: [
		{
			name: "jsx-css",
			regex: /<[A-Za-z_$][\w$.-]*\b/g,
			form: "jsx-style",
			styleProps: ["css"],
		},
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
	],
	packages: {
		packages: [
			{ name: "@emotion/css", kind: "runtime" },
			{ name: "@emotion/styled", kind: "peer" },
		],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Emotion, "exact", {
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
	detect: detectEmotion,
	sourceModules: ["@emotion/css", "@emotion/react", "@emotion/styled"],
	configFiles: [".emotionrc", "emotion.config.js", "package.json"],
	sourceObjectOptions: (_source, context) => {
		const references = importedStaticValues(context, context.source);
		console.error("EMOTION_DEBUG", context.file, references);
		return {
			dynamicReferences: references,
			computedKeyResolver: (expression) => references[expression],
			nestedObjectKind: "selector",
		};
	},
	migration: {
		rewrite: ({ code, targetId, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			return {
				code: code.replace(/<Global\s+styles=\{[^{}]+\}\s*\/>/g, "<></>"),
				residuals: [],
			};
		},
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
