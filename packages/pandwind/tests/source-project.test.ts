import { describe, expect, test } from "vitest";
import { dirname, resolve } from "node:path";
import {
	createSourceProjectBindingIndex,
	type SourceProjectBindingLoader,
} from "../src/source-project.ts";
import { SourceBindingKind } from "../src/source-bindings.ts";

describe("source project bindings", () => {
	test("resolves aliased imports through multiple relative re-export barrels", () => {
		const files = new Map([
			[
				"/project/entry.ts",
				'import { makeCss } from "./styles"; export const card = makeCss({ color: "red" });',
			],
			["/project/styles.ts", 'export { css as makeCss } from "./emotion";'],
			["/project/emotion.ts", 'export { css } from "@emotion/css";'],
		]);
		const loader: SourceProjectBindingLoader = {
			read: (file) => {
				const source = files.get(file);
				return source === undefined ? undefined : { file, source };
			},
			resolve: (importer, specifier) => {
				if (!specifier.startsWith(".")) return undefined;
				const base = resolve(dirname(importer), specifier);
				return [base, `${base}.ts`].find((candidate) => files.has(candidate));
			},
		};

		const index = createSourceProjectBindingIndex(loader);

		expect(index.resolve("/project/entry.ts", "makeCss")).toEqual(
			expect.objectContaining({
				localName: "makeCss",
				importedName: "css",
				source: "@emotion/css",
				kind: SourceBindingKind.Reexport,
			}),
		);
	});

	test("does not execute or guess package implementations", () => {
		const index = createSourceProjectBindingIndex({
			read: (file) =>
				file === "/project/entry.ts"
					? { file, source: 'import { css } from "@emotion/css";' }
					: undefined,
			resolve: () => undefined,
		});

		expect(index.resolve("/project/entry.ts", "css")).toEqual(
			expect.objectContaining({ source: "@emotion/css", importedName: "css" }),
		);
	});

	test("resolves imports through export-star barrels", () => {
		const files = new Map([
			[
				"/project/entry.ts",
				'import { css as makeCss } from "./styles"; export const card = makeCss({ color: "red" });',
			],
			["/project/styles.ts", 'export * from "./emotion";'],
			["/project/emotion.ts", 'export { css } from "@emotion/css";'],
		]);
		const loader: SourceProjectBindingLoader = {
			read: (file) => {
				const source = files.get(file);
				return source === undefined ? undefined : { file, source };
			},
			resolve: (importer, specifier) => {
				if (!specifier.startsWith(".")) return undefined;
				const base = resolve(dirname(importer), specifier);
				return [base, `${base}.ts`].find((candidate) => files.has(candidate));
			},
		};

		expect(createSourceProjectBindingIndex(loader).resolve("/project/entry.ts", "makeCss")).toEqual(
			expect.objectContaining({
				importedName: "css",
				source: "@emotion/css",
				kind: SourceBindingKind.Reexport,
			}),
		);
	});
});
