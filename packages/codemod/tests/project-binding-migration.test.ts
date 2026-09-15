import { describe, expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

describe("project binding migration", () => {
	test("detects and parses an adapter imported through a relative barrel", () => {
		const files = new Map([
			[
				"/project/entry.tsx",
				'import { makeCss } from "./styles";\nexport const card = makeCss({ color: "red" });',
			],
			["/project/styles.ts", 'export * from "./emotion";'],
			["/project/emotion.ts", 'export { css as makeCss } from "@emotion/css";'],
		]);
		const result = runAdapterMigration(files.get("/project/entry.tsx")!, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Pandwind,
			file: "/project/entry.tsx",
			root: "/project",
			readFile: (file) => files.get(file),
			mode: "safe",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain("createUnsafeCss");
		expect(result.code).not.toContain("pandwind:migrate-skip");
	});
});
