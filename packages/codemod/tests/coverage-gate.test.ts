import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createAdapterCoverageGate,
	createStyleAdapterRegistry,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";

describe("adapter coverage gate", () => {
	test("accepts substitute evidence and reports per-adapter dimensions", () => {
		const emotion = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!;
		const report = createAdapterCoverageGate().evaluate(
			createStyleAdapterRegistry([emotion]),
			[
				{
					adapter: CodemodAdapterId.Emotion,
					fixture: "emotion.tsx",
					kind: "contract",
					capabilities: ["declarations"],
				},
				{
					adapter: CodemodAdapterId.Emotion,
					fixture: "emotion-real.tsx",
					kind: "real-repository",
					capabilities: ["dynamic-values"],
				},
			],
			{
				minimumFixturesPerAdapter: 1,
				minimumRealRepositoryFixturesPerAdapter: 1,
				requiredCapabilities: ["declarations", "dynamic-values"],
			},
		);
		expect(report.passed).toBe(true);
		expect(report.entries[0]).toMatchObject({
			adapter: CodemodAdapterId.Emotion,
			fixtures: 2,
			contractFixtures: 1,
			realRepositoryFixtures: 1,
		});
	});

	test("fails explicitly for missing adapter and capability evidence", () => {
		const emotion = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!;
		const report = createAdapterCoverageGate().evaluate(createStyleAdapterRegistry([emotion]), [], {
			minimumFixturesPerAdapter: 1,
			minimumRealRepositoryFixturesPerAdapter: 1,
			requiredCapabilities: ["declarations"],
		});
		expect(report.passed).toBe(false);
		expect(report.failures).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ adapter: CodemodAdapterId.Emotion }),
				expect.objectContaining({ capability: "declarations" }),
			]),
		);
	});
});
