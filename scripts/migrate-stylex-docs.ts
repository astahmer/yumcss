import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../packages/codemod/src/swap/index.ts";

export type StylexDocsLane = "runtime-css" | "atomic-css" | "design-dss";

export interface StylexDocsLaneReport {
	readonly lane: StylexDocsLane;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly invalidValidations: number;
	readonly outputBytes: number;
}

interface StylexDocsMigrationLane {
	readonly id: StylexDocsLane;
	migrate(source: string, context: { file: string; root: string }): AdapterMigrationResult;
}

function splitObjectEntries(object: string): string[] {
	const entries: string[] = [];
	let start = 1;
	let depth = 0;
	let quote: string | undefined;
	for (let index = 1; index < object.length - 1; index++) {
		const character = object[index]!;
		if (quote !== undefined) {
			if (character === quote && object[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{" || character === "[" || character === "(") depth++;
		if (character === "}" || character === "]" || character === ")") depth--;
		if (character === "," && depth === 0) {
			entries.push(object.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = object.slice(start, -1).trim();
	if (last !== "") entries.push(last);
	return entries;
}

function matchingCallEnd(source: string, open: number): number {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth++;
		if (character === ")" && --depth === 0) return index;
	}
	return source.length - 1;
}

function rewriteNamedGroups(source: string, mode: "atomic" | "design"): string {
	let output = source;
	const calls = [...source.matchAll(/\bcss\.group\s*\(/g)].reverse();
	for (const call of calls) {
		const start = call.index ?? 0;
		const open = start + call[0].lastIndexOf("(");
		const end = matchingCallEnd(output, open);
		const argument = output.slice(open + 1, end).trim();
		if (!argument.startsWith("{") || !argument.endsWith("}")) continue;
		const entries = splitObjectEntries(argument).map((entry) => {
			const separator = entry.indexOf(":");
			if (separator < 0) return entry;
			const key = entry.slice(0, separator).trim();
			const value = entry.slice(separator + 1).trim();
			return mode === "atomic" ? `${key}: css.class(${value})` : `${key}: { $raw: ${value} }`;
		});
		const replacement = `css.group({ ${entries.join(", ")} })`;
		output = `${output.slice(0, start)}${replacement}${output.slice(end + 1)}`;
	}
	if (mode === "design") {
		output = output.replaceAll(
			'import { createCss } from "pandwind/css";',
			'import { createDesignCss } from "pandwind/design";',
		);
		output = output.replaceAll(
			"const css = createCss();",
			"const dcss = createDesignCss(pandwindPreset);",
		);
		output = output.replaceAll("css.group(", "dcss.group(");
		output = output.replace(
			/import \{ createDesignCss \} from "pandwind\/design";/,
			'import { createDesignCss } from "pandwind/design";\nimport { pandwindPreset } from "pandwind/preset";',
		);
	}
	return output;
}

function createLane(id: StylexDocsLane): StylexDocsMigrationLane {
	return {
		id,
		migrate(source, context) {
			const result = runAdapterMigration(source, {
				from: "stylex",
				to: "pandwind",
				file: context.file,
				root: context.root,
				mode: "safe",
				semantic: { source: { file: context.file, framework: "react" } },
			});
			if (id === "runtime-css") return result;
			return {
				...result,
				code: rewriteNamedGroups(result.code, id === "atomic-css" ? "atomic" : "design"),
			};
		},
	};
}

export class StylexDocsMigration {
	static readonly lanes: readonly StylexDocsMigrationLane[] = [
		createLane("runtime-css"),
		createLane("atomic-css"),
		createLane("design-dss"),
	];

	static async run(
		root: string,
		laneId: StylexDocsLane,
		outputRoot?: string,
	): Promise<StylexDocsLaneReport> {
		const lane = this.lanes.find((candidate) => candidate.id === laneId);
		if (lane === undefined) throw new Error(`Unknown StyleX docs lane: ${laneId}`);
		const sourceRoot = resolve(root, "src");
		const files: string[] = [];
		const visit = async (directory: string): Promise<void> => {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const file = join(directory, entry.name);
				if (entry.isDirectory()) await visit(file);
				else if (/\.(?:[cm]?[jt]sx?|mdx?)$/.test(entry.name)) files.push(file);
			}
		};
		await visit(sourceRoot);
		let sourceFiles = 0;
		let changedFiles = 0;
		let converted = 0;
		let skipped = 0;
		let residuals = 0;
		let invalidValidations = 0;
		let outputBytes = 0;
		for (const absoluteFile of files.sort()) {
			const source = await readFile(absoluteFile, "utf8");
			if (!source.includes("stylex")) continue;
			sourceFiles++;
			const file = relative(root, absoluteFile);
			const result = lane.migrate(source, { file, root });
			if (result.changed) changedFiles++;
			converted += result.converted;
			skipped += result.skipped;
			residuals += result.residuals.length;
			invalidValidations += result.validations.filter((validation) => !validation.valid).length;
			outputBytes += Buffer.byteLength(result.code);
			if (outputRoot !== undefined) {
				const outputFile = join(outputRoot, file);
				await mkdir(resolve(outputFile, ".."), { recursive: true });
				await writeFile(outputFile, result.code);
			}
		}
		return {
			lane: laneId,
			sourceFiles,
			changedFiles,
			converted,
			skipped,
			residuals,
			invalidValidations,
			outputBytes,
		};
	}
}

if (import.meta.main) {
	const lane = process.argv[2] as StylexDocsLane | undefined;
	if (lane === undefined)
		throw new Error(
			"Usage: tsx scripts/migrate-stylex-docs.ts <runtime-css|atomic-css|design-dss>",
		);
	const report = await StylexDocsMigration.run(
		resolve("examples/stylex-docs-migration/source"),
		lane,
	);
	console.log(JSON.stringify(report, null, 2));
}
