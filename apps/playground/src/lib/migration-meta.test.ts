import { describe, expect, test } from "vitest";
import { PLAYGROUND_MIGRATION_META } from "./migration-meta.ts";

describe("playground migration interop metadata", () => {
	test("resolves shared utility value types from the deduplicated catalog", () => {
		const interop = PLAYGROUND_MIGRATION_META.interop;
		if (interop === undefined) throw new Error("playground interop artifact is missing");

		const valueTypeCounts = new Map<string, number>();
		for (const utility of interop.utilities) {
			if (utility.valueType === undefined) continue;
			valueTypeCounts.set(utility.valueType, (valueTypeCounts.get(utility.valueType) ?? 0) + 1);
			expect(PLAYGROUND_MIGRATION_META.valueLiterals.has(utility.valueType)).toBe(true);
		}

		const sharedValueType = [...valueTypeCounts].find(([, count]) => count > 1)?.[0];
		if (sharedValueType === undefined)
			throw new Error("generated utilities do not share a value type");
		expect(PLAYGROUND_MIGRATION_META.valueLiterals.get(sharedValueType)).toEqual(
			new Set(interop.valueTypes[sharedValueType] ?? []),
		);
	});
});
