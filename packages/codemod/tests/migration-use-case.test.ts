import { describe, expect, test } from "vitest";
import { createStyleMigrationUseCase } from "../src/swap/index.ts";

describe("style migration use case", () => {
	test("exposes migration as a swappable application port", () => {
		const useCase = createStyleMigrationUseCase();
		const result = useCase.run('const card = css({ color: "red" });', {
			from: "emotion",
			to: "styled-components",
			file: "Card.tsx",
		});
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
	});
});
