import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PANDWIND_EDITOR_MODULE_PATHS } from "./editor-types.ts";
import { EXAMPLES } from "./examples.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const playgroundRoot = join(repositoryRoot, "apps/playground");
const generatedSourceRoot = join(playgroundRoot, "src");
const examplePresetSource = join(repositoryRoot, "examples/pandwind-example-preset/src/index.ts");

const exampleDirectory = (examplePath: string, api: string): string =>
	examplePath.slice(1).replaceAll("/", "-") + "-" + api;

function typecheckExamples(): string {
	const temporaryRoot = mkdtempSync(join(repositoryRoot, ".tmp-playground-examples-"));
	try {
		const sourceFiles: string[] = [];
		for (const example of EXAMPLES) {
			for (const variant of example.variants) {
				const directory = join(temporaryRoot, exampleDirectory(example.path, variant.api));
				mkdirSync(directory, { recursive: true });
				for (const file of variant.files) {
					const filePath = join(directory, file.name);
					writeFileSync(filePath, file.code, "utf8");
					sourceFiles.push(filePath);
				}
			}
		}
		const globalFile = join(temporaryRoot, "playground-globals.d.ts");
		writeFileSync(globalFile, "declare const props: { active: boolean; tone: string };\n", "utf8");

		const paths = Object.fromEntries(
			Object.entries(PANDWIND_EDITOR_MODULE_PATHS).map(([specifier, modulePath]) => [
				specifier,
				[join(generatedSourceRoot, modulePath)],
			]),
		);
		paths["@pandwind/example-preset"] = [examplePresetSource];
		const configFile = join(temporaryRoot, "tsconfig.json");
		writeFileSync(
			configFile,
			JSON.stringify(
				{
					compilerOptions: {
						allowImportingTsExtensions: true,
						jsx: "react-jsx",
						lib: ["ES2022", "DOM"],
						module: "ESNext",
						moduleResolution: "Bundler",
						noEmit: true,
						paths,
						skipLibCheck: true,
						strict: true,
						target: "ES2022",
						types: [],
					},
					files: [...sourceFiles, globalFile],
				},
				undefined,
				2,
			),
			"utf8",
		);
		try {
			execFileSync("pnpm", ["exec", "tsc", "--project", configFile, "--pretty", "false"], {
				cwd: repositoryRoot,
				stdio: ["ignore", "pipe", "pipe"],
				encoding: "utf8",
			});
			return "";
		} catch (error) {
			const processError = error as { stdout?: string; stderr?: string };
			return `${processError.stdout ?? ""}${processError.stderr ?? ""}`.trim();
		}
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

describe("playground example catalog typechecks", () => {
	it("keeps every example valid against the generated public declarations", () => {
		expect(typecheckExamples()).toBe("");
	});
});
