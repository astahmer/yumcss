import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/analyze-comment.yml"), "utf8");

describe("reusable analyze workflow", () => {
	test("is independent of the caller's Pandwind source tree", () => {
		expect(workflow).toContain("pandwind-version:");
		expect(workflow).toContain('pnpm dlx --package "pandwind-analyze@$PANDWIND_VERSION" pandwind-analyze');
		expect(workflow).not.toContain("../../packages/analyze/src/cli.ts");
		expect(workflow).not.toContain("nub .github/scripts/analyze-comment.mjs");
	});

	test("normalizes repository and application roots before comparing branches", () => {
		expect(workflow).toContain('WORK_ROOT="$GITHUB_WORKSPACE${WORK_DIR:+/$WORK_DIR}"');
		expect(workflow).toContain('BASE_ROOT="$GITHUB_WORKSPACE/base-checkout${WORK_DIR:+/$WORK_DIR}"');
	});
});
