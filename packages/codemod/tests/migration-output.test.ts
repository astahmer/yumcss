import { describe, expect, test } from "vitest";
import { MigrationOutput } from "../src/swap/migration-output.ts";

describe("MigrationOutput", () => {
	test("keeps type-only imports separate from value imports", () => {
		expect(
			MigrationOutput.consolidateImports([
				'import type { StyleProps } from "./css";',
				'import { css } from "./css";',
			]),
		).toEqual(['import { css } from "./css";', 'import type { StyleProps } from "./css";']);
	});
});
