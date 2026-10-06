import { toOxcNode } from "../oxc-node.ts";
import { NodeKind } from "../ast-node-kind.ts";
/**
 * Tailwind source collection — extracts the classes used by `tw()` calls and
 * writes them to a safelist file that Tailwind's file scanner can see.
 *
 * Tailwind v4 scans source files on disk for literal class candidates, so
 * classes composed at runtime by `tw()` are invisible to it. This service
 * evaluates every literal `tw({ ... })` call in the app source using the same
 * typed `tw` instance the app imports and writes exactly those candidates.
 */
import { basename, dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { createSourceWorkspace, type SourceWorkspace } from "../source-workspace.ts";
import { findCxImports } from "../vite/cx-inline.ts";
import { collectCxClassCandidates, pushVerifiedCandidate } from "../vite/cx-call-rewriter.ts";
import { collectModuleConstants } from "../vite/cx-static-evaluator.ts";
import { tokenHasExactCss, type UnresolvedToken, createLineIndex } from "../vite/unresolved.ts";
import { extractTwConfigFromSources } from "../vite/inline.ts";
import { evalLiteral, evalLiteralValues, isTwCall, walk } from "./literal.ts";

export interface TwScanOptions {
	readonly twEntry: string;
	readonly srcDir: string;
	readonly outFile: string;
}

export interface TwScanResult {
	readonly outFile: string;
	readonly classes: readonly string[];
	/** Dynamic candidates whose tokens have no exact design-system CSS. */
	readonly unresolvedTokens?: readonly UnresolvedToken[];
}

/** Full collector output: safelist classes plus unresolvable dynamic tokens. */
export interface TwCollectResult {
	readonly classes: readonly string[];
	readonly unresolvedTokens: readonly UnresolvedToken[];
}

export interface TwClassCollector {
	collect(
		files: readonly string[],
		twEntry: string,
		workspace?: SourceWorkspace,
	): Promise<TwCollectResult>;
}

class DefaultTwClassCollector implements TwClassCollector {
	async collect(
		files: readonly string[],
		twEntry: string,
		workspace: SourceWorkspace = createSourceWorkspace(),
	): Promise<TwCollectResult> {
		const { tw } = (await import(twEntry)) as { tw: (styles: unknown) => string };
		const classes = new Set<string>();
		// cx() never calls tw() itself: its merge uses generated compose/
		// conflict metadata instead. Verify its finite class candidates
		// through the same strict catalog the vite lane uses so scan output
		// stays identical to what the bundler lane would have registered.
		const generatedSources = [
			twEntry,
			resolve(dirname(twEntry), "tw.runtime.ts"),
			resolve(dirname(twEntry), "tw.conflicts.ts"),
			resolve(dirname(twEntry), "tw.build.ts"),
		].flatMap((path) => (existsSync(path) ? [readFileSync(path, "utf8")] : []));
		const config = extractTwConfigFromSources(generatedSources);
		const unresolvedTokens: UnresolvedToken[] = [];

		for (const { path: file, source, scan } of workspace.read(files)) {
			if (!SOURCE_SCANNER_SERVICE.isScriptFile(file)) continue;
			const result = SOURCE_SCANNER_SERVICE.parse({
				file,
				source,
				language: scan.language,
			});
			const lines = config !== undefined ? createLineIndex(source) : undefined;

			walk(toOxcNode(result.program), (node) => {
				if (!isTwCall(node)) return;
				for (const argument of node.arguments) {
					const styles = evalLiteral(argument);
					if (styles !== undefined) {
						try {
							for (const className of tw(styles).split(" ")) {
								if (className) classes.add(className);
							}
						} catch {
							// Unrepresentable calls stay on the runtime path.
						}
						continue;
					}
					// Not a proven literal: register every candidate a bounded
					// dynamic value set may produce at runtime so the Tailwind
					// scanner emits CSS for all of them (plan 057).
					const valueSet = evalLiteralValues(argument);
					if (valueSet === undefined) continue;
					for (const candidateStyles of valueSet.values) {
						if (
							typeof candidateStyles !== "object" ||
							candidateStyles === null ||
							Array.isArray(candidateStyles)
						) {
							continue;
						}
						try {
							for (const className of tw(candidateStyles).split(" ")) {
								if (!className) continue;
								// Same exact-match gate as the vite lane: a finite
								// dynamic set may only register classes the design
								// system actually defines; the rest is reported.
								if (config === undefined || tokenHasExactCss(className, config)) {
									classes.add(className);
								} else {
									unresolvedTokens.push({
										token: className,
										line: lines ? lines.lineOf(Number(node.start ?? 0)) : 0,
										reason: "no-css",
									});
								}
							}
						} catch {
							// Unrepresentable candidate stays on the runtime path.
						}
					}
				}
			});
			if (config !== undefined) {
				// Only a cx() imported from the same generated module as tw() is
				// ours; foreign cx() helpers (clsx, other libs) are left alone.
				const entryBase = basename(twEntry).split(".")[0];
				const cxNames = findCxImports(
					source,
					file,
					(importSource) => {
						if (importSource === entryBase) return true;
						return importSource.endsWith("/" + entryBase);
					},
					toOxcNode(result.program),
				).localNames;
				if (cxNames.size > 0) {
					const consts = new Map(
						[...collectModuleConstants(toOxcNode(result.program))].map(
							([name, known]) => [name, known.value] as const,
						),
					);
					const verified = new Set<string>();
					walk(toOxcNode(result.program), (node) => {
						if (
							node.type !== NodeKind.CallExpression ||
							node.callee === null ||
							typeof node.callee !== "object" ||
							(node.callee as { type?: string; name?: string }).type !== NodeKind.Identifier ||
							!cxNames.has((node.callee as { name?: string }).name ?? "")
						)
							return;
						const argumentsValue = node["arguments"];
						if (!Array.isArray(argumentsValue)) return;
						for (const argument of argumentsValue) {
							for (const candidate of collectCxClassCandidates(argument, consts)) {
								if (verified.has(candidate)) continue;
								const pending: string[] = [];
								if (
									pushVerifiedCandidate(
										candidate,
										config,
										pending,
										unresolvedTokens,
										lines ? lines.lineOf(Number(node.start ?? 0)) : 0,
									)
								) {
									for (const cls of pending) verified.add(cls);
								}
							}
						}
					});
					for (const candidate of verified) classes.add(candidate);
				}
			}
		}

		return { classes: [...classes], unresolvedTokens };
	}
}

export const createTwClassCollector = (): TwClassCollector => new DefaultTwClassCollector();

export const collectTwClasses = async (
	files: readonly string[],
	twEntry: string,
	workspace?: SourceWorkspace,
): Promise<string[]> => [
	...(await createTwClassCollector().collect(files, twEntry, workspace)).classes,
];

const header = "Generated by yumcss — do not edit. Run `yumcss-codemod tw scan` to regenerate.";

export async function runTwScan(options: TwScanOptions): Promise<TwScanResult> {
	const workspace = createSourceWorkspace();
	const files = workspace.files(["**/*"], options.srcDir);
	const { classes, unresolvedTokens } = await createTwClassCollector().collect(
		files,
		options.twEntry,
		workspace,
	);

	// Emit Tailwind v4 `@source inline(...)` directives; import the output
	// from tailwind.css so dynamic candidates get compiled CSS.
	const inlineLines = classes
		.map((className) => `@source inline(${JSON.stringify(className)});`)
		.join("\n");
	writeFileSync(options.outFile, `/* ${header} */\n\n${inlineLines}\n`);
	return { outFile: options.outFile, classes, unresolvedTokens };
}
