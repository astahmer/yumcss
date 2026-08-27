import { describe, expect, test } from "vitest";
import {
	createSwapRegistry,
	type SwapSourceAdapter,
	type SwapTargetAdapter,
} from "../src/swap/index.ts";

describe("SwapRegistry", () => {
	test("registers source and target implementations without orchestrator edits", () => {
		const source: SwapSourceAdapter = {
			id: "custom-source",
			parse: () => [{ start: 0, end: 1, shape: "css", ir: { entries: [], residuals: [] } }],
		};
		const target: SwapTargetAdapter = {
			id: "custom-target",
			emit: () => ({ text: "custom()", residuals: [] }),
		};
		const registry = createSwapRegistry([source], [target]);
		expect(registry.getSource("custom-source")).toBe(source);
		expect(registry.getTarget("custom-target")).toBe(target);
		expect(
			registry.scanSource("custom-source", { file: "Card.tsx", source: "x", meta: {} as never }),
		).toEqual([{ start: 0, end: 1, shape: "css", ir: { entries: [], residuals: [] } }]);
	});
});
