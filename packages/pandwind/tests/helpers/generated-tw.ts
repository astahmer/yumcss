import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractTwConfigFromSources, type TwConfig } from "../../src/vite/inline.ts";

const generatedDirectory = resolve(import.meta.dirname, "../../../../examples/example/src");

export const readGeneratedTwSources = (directory: string): readonly string[] =>
	[
		resolve(directory, "tw.ts"),
		resolve(directory, "tw.runtime.ts"),
		resolve(directory, "tw.conflicts.ts"),
		resolve(directory, "tw.build.ts"),
	].flatMap((path) => (existsSync(path) ? [readFileSync(path, "utf8")] : []));

export const readGeneratedTwConfig = (directory: string): TwConfig => {
	const config = extractTwConfigFromSources(readGeneratedTwSources(directory));
	if (config === undefined)
		throw new Error(`could not extract generated tw config from ${directory}`);
	return config;
};

/**
 * The generated tw module is TypeScript and bundlers parse JS only, so derive
 * a plain-JS twin for the bundler fixtures: join the entry with its runtime and
 * build companions, then strip imports and TS-only syntax. What remains still
 * carries the createTw metadata and value tokens the inline pass extracts.
 *
 * The conflict catalog companion stays out of the twin on purpose. Its packed
 * decoder uses TS-only type syntax, and the entry's `__pandwindRuntimeConfig`
 * export exists only to pair the conflict catalog with the runtime metadata.
 * Without that companion the export would read an unresolved global, which
 * bundlers keep as a dead `({ conflicts: __pandwindConflicts });` statement.
 * The conflict catalog path is covered over the real artifacts by
 * `tests/vite-inline.test.ts`.
 */
export const writeJsTwModule = (directory: string): string => {
	let source = [
		readFileSync(resolve(generatedDirectory, "tw.runtime.ts"), "utf8"),
		readFileSync(resolve(generatedDirectory, "tw.build.ts"), "utf8"),
		readFileSync(resolve(generatedDirectory, "tw.ts"), "utf8"),
	].join("\n");
	source = source.replace(/^export const __pandwindRuntimeConfig[^]*?\n\};\n/m, "");
	source = source.replace(/^import [^\n]*$/gm, "");
	source = source.replace(/createTw<[^>(]*>\(/, "createTw(");
	source = source.replace(/: string\[\]/g, "");
	source = source.replace(/: TwOptions(?:\[[^\]]*\])? = \{/g, " = {");
	const target = join(directory, "tw.js");
	writeFileSync(target, source);
	return target;
};
