import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { NodeProjectModuleLoader } from "../src/swap/project-module-loader.ts";

describe("NodeProjectModuleLoader", () => {
	test("resolves an official package nested under a declared dependency", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-project-loader-"));
		try {
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({
					private: true,
					dependencies: { "host-pkg": "1.0.0" },
				}),
			);
			const host = join(root, "node_modules/host-pkg");
			const nested = join(host, "node_modules/nested-pkg");
			mkdirSync(nested, { recursive: true });
			writeFileSync(
				join(host, "package.json"),
				JSON.stringify({ name: "host-pkg", type: "module", main: "index.js" }),
			);
			writeFileSync(join(host, "index.js"), "export const host = true;\n");
			writeFileSync(
				join(nested, "package.json"),
				JSON.stringify({ name: "nested-pkg", type: "module", main: "index.js" }),
			);
			writeFileSync(join(nested, "index.js"), 'export const value = "nested";\n');

			const module = await new NodeProjectModuleLoader().importPackage<{ value: string }>(
				"nested-pkg",
				root,
			);

			expect(module?.value).toBe("nested");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats an optional package with an unusable exports map as unavailable", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-project-loader-"));
		try {
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({
					private: true,
					dependencies: { "host-pkg": "1.0.0" },
				}),
			);
			const host = join(root, "node_modules/host-pkg");
			const unavailable = join(host, "node_modules/unavailable-pkg");
			mkdirSync(unavailable, { recursive: true });
			writeFileSync(
				join(host, "package.json"),
				JSON.stringify({ name: "host-pkg", type: "module", main: "index.js" }),
			);
			writeFileSync(join(host, "index.js"), "export const host = true;\n");
			writeFileSync(
				join(unavailable, "package.json"),
				JSON.stringify({ name: "unavailable-pkg", type: "module", exports: {} }),
			);

			const module = await new NodeProjectModuleLoader().importPackage(
				"unavailable-pkg",
				root,
			);

			expect(module).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
