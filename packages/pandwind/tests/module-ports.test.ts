import { describe, expect, test } from "vitest";
import { parseSourceProgram } from "../src/source-scanner.ts";
import {
	createCrossModuleConstResolver,
	type CrossModuleResolver,
} from "../src/vite/cross-module-consts.ts";
import type { ModulePathResolver, ModuleSourceReader } from "../src/vite/module-ports.ts";

describe("cross-module resolver ports", () => {
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
});
