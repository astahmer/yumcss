import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractTwConfigFromSources, type TwConfig } from "../../src/vite/inline.ts";

export const readGeneratedTwSources = (directory: string): readonly string[] =>
	[
		resolve(directory, "tw.ts"),
		resolve(directory, "tw.runtime.ts"),
		resolve(directory, "tw.build.ts"),
	].flatMap((path) => (existsSync(path) ? [readFileSync(path, "utf8")] : []));

export const readGeneratedTwConfig = (directory: string): TwConfig => {
	const config = extractTwConfigFromSources(readGeneratedTwSources(directory));
	if (config === undefined)
		throw new Error(`could not extract generated tw config from ${directory}`);
	return config;
};
