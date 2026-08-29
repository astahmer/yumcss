import { describe, expect, test } from "vitest";
import { createSourceWorkspace } from "../src/source-workspace.ts";

describe("source workspace port", () => {
	test("keeps filesystem selection independent from language policy", () => {
		const workspace = createSourceWorkspace({
			glob: (pattern) =>
				pattern === "**/*" ? ["src/Card.vue", "src/Card.tsx", "node_modules/pkg/index.ts"] : [],
			isFile: (file) => !file.includes("node_modules"),
			readFile: (file) => `source for ${file}`,
		});

		expect(workspace.files({ root: "/project", patterns: ["**/*"] })).toEqual([
			"/project/src/Card.tsx",
			"/project/src/Card.vue",
		]);
		expect(workspace.documents({ root: "/project", patterns: ["**/*"] })).toEqual([
			{
				file: "/project/src/Card.tsx",
				root: "/project",
				source: "source for /project/src/Card.tsx",
			},
			{
				file: "/project/src/Card.vue",
				root: "/project",
				source: "source for /project/src/Card.vue",
			},
		]);
	});

	test("allows a caller to supply its own file provider", () => {
		const workspace = createSourceWorkspace({
			glob: () => ["virtual.tsx"],
			isFile: () => true,
			readFile: () => "export const value = 1",
		});

		expect(workspace.read("/virtual.tsx")).toEqual({
			file: "/virtual.tsx",
			source: "export const value = 1",
		});
	});
});
