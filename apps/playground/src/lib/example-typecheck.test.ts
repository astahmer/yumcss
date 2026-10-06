import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { YUMCSS_EDITOR_MODULE_PATHS } from "./editor-types.ts";
import { EXAMPLES } from "./examples.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const playgroundRoot = join(repositoryRoot, "apps/playground");
const generatedSourceRoot = join(playgroundRoot, "src");
const examplePresetSource = join(repositoryRoot, "examples/yumcss-example-preset/src/index.ts");

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
		const jsxFile = join(temporaryRoot, "playground-jsx.d.ts");
		writeFileSync(
			jsxFile,
			[
				'import type * as React from "react";',
				'declare module "react/jsx-runtime" {',
				"  export function jsx(type: React.JSX.ElementType, props: unknown, key?: React.Key): React.JSX.Element;",
				"  export function jsxs(type: React.JSX.ElementType, props: unknown, key?: React.Key): React.JSX.Element;",
				"  export const Fragment: React.JSXElementConstructor<{ children?: React.ReactNode }>;",
				"}",
				'declare module "react/jsx-dev-runtime" {',
				"  export function jsxDEV(type: React.JSX.ElementType, props: unknown, key: React.Key | undefined, isStaticChildren: boolean, source: unknown, self: unknown): React.JSX.Element;",
				"  export const Fragment: React.JSXElementConstructor<{ children?: React.ReactNode }>;",
				"}",
				"declare namespace JSX {",
				"  type Element = React.JSX.Element;",
				"  type ElementType = React.JSX.ElementType;",
				"  interface ElementClass extends React.JSX.ElementClass {}",
				"  interface IntrinsicElements extends React.JSX.IntrinsicElements {}",
				"}",
			].join("\n") + "\n",
			"utf8",
		);
		const reactTypes = join(generatedSourceRoot, "generated/dependencies/react/index.d.ts");
		const csstypeTypes = join(generatedSourceRoot, "generated/dependencies/csstype/index.d.ts");
		const paths = Object.fromEntries(
			Object.entries(YUMCSS_EDITOR_MODULE_PATHS).map(([specifier, modulePath]) => [
				specifier,
				[join(generatedSourceRoot, modulePath)],
			]),
		);
		paths.react = [reactTypes];
		paths.csstype = [csstypeTypes];
		paths["react/jsx-runtime"] = [jsxFile];
		paths["react/jsx-dev-runtime"] = [jsxFile];
		paths["@yumcss/example-preset"] = [examplePresetSource];
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
					files: [...sourceFiles, reactTypes, csstypeTypes, jsxFile],
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
