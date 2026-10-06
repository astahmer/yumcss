import { describe, expect, test } from "vitest";
import { parseSourceProgram } from "../src/source-scanner.ts";
import {
	createCrossModuleConstResolver,
	type CrossModuleResolver,
} from "../src/vite/cross-module-consts.ts";
import type { ModulePathResolver, ModuleSourceReader } from "../src/vite/module-ports.ts";

describe("cross-module resolver ports", () => {
	test("shares unchanged parsed programs across tooling consumers", () => {
		const document = {
			file: "shared-cache-fixture.ts",
			source: 'export const className = "text-sm";',
		};
		const first = parseSourceProgram(document);
		const second = parseSourceProgram(document);
		const changed = parseSourceProgram({ ...document, source: `${document.source}\n` });

		expect(second).toBe(first);
		expect(changed).not.toBe(first);
	});

	test("accepts a bundler-owned reader and path resolver", () => {
		const modules = new Map([["constants.ts", 'export const P6 = "p-6";']]);
		const reader: ModuleSourceReader = {
			read: (path) => modules.get(path) ?? "",
			mtime: () => 1,
		};
		const paths: ModulePathResolver = {
			resolve: (source) => (source === "./constants" ? "constants.ts" : undefined),
		};
		const resolver: CrossModuleResolver = createCrossModuleConstResolver({
			sourceReader: reader,
			pathResolver: paths,
		});
		const program = parseSourceProgram({
			file: "app.ts",
			source: 'import { P6 } from "./constants"; export const cls = P6;',
		}).program;

		expect(resolver.importedScope("app.ts", program as never).get("P6")).toEqual({
			value: "p-6",
			declStart: 0,
		});
	});

	test("keeps recently used modules through large cache growth", () => {
		const modules = new Map<string, string>();
		const reads = new Map<string, number>();
		const reader: ModuleSourceReader = {
			read: (path) => {
				reads.set(path, (reads.get(path) ?? 0) + 1);
				return modules.get(path) ?? "";
			},
			mtime: () => 1,
		};
		const paths: ModulePathResolver = {
			resolve: (source) => (source.startsWith("./module-") ? `${source.slice(2)}.ts` : undefined),
		};
		const resolver = createCrossModuleConstResolver({
			sourceReader: reader,
			pathResolver: paths,
		});
		const importedScope = (index: number) => {
			const path = `module-${index}.ts`;
			modules.set(path, `export const VALUE = "value-${index}";`);
			const document = {
				file: "app.ts",
				source: `import { VALUE } from "./module-${index}"; export const cls = VALUE;`,
			};
			return resolver.importedScope("app.ts", parseSourceProgram(document).program as never);
		};

		for (let index = 0; index < 2048; index++) importedScope(index);
		importedScope(0);
		importedScope(2048);
		importedScope(0);

		expect(reads.get("module-0.ts")).toBe(1);
		importedScope(1);
		expect(reads.get("module-1.ts")).toBe(2);
	});
});
