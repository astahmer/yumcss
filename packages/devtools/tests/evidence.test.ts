import { describe, expect, it, vi } from "vitest";
import { createDevtoolsEvidenceStore } from "../src/evidence/store.ts";

describe("devtools evidence store", () => {
	it("keeps the latest build evidence in a typed snapshot", () => {
		const store = createDevtoolsEvidenceStore("/project");
		store.recordTransform("src/Card.tsx", 42, 1.5);
		store.recordTransform("src/Card.tsx", 45, 2.5);
		store.recordScan({
			file: "src/Card.tsx",
			language: "tsx",
			diagnosticCount: 0,
			excludedRangeCount: 1,
		});
		store.recordDiagnostic({
			id: "diagnostic:1",
			severity: "warning",
			message: "dynamic style value",
			source: "scanner",
		});

		const snapshot = store.snapshot();
		expect(snapshot.schema).toBe("yumcss.devtools.evidence/1");
		expect(snapshot.transforms).toMatchObject([
			{ file: "src/Card.tsx", bytes: 45, transformCount: 2 },
		]);
		expect(snapshot.scans[0]).toMatchObject({ file: "src/Card.tsx", language: "tsx" });
		expect(snapshot.diagnostics[0]).toMatchObject({ severity: "warning" });
	});

	it("replaces the current element selection with a newer pick", () => {
		vi.useFakeTimers();
		const store = createDevtoolsEvidenceStore("/project");
		const pick = (tagName: string) => ({
			tagName,
			className: "pw-card",
			classNames: ["pw-card"],
			attributes: {},
			computedStyles: { color: "red" },
			classRules: [
				{
					className: "pw-card",
					selector: ".pw-card:hover",
					conditions: ["@media (min-width: 768px)"],
					declarations: "color: red;",
				},
			],
			matchedPrograms: [],
		});
		vi.setSystemTime(1_000);
		store.select(pick("button"));
		vi.setSystemTime(2_000);
		store.select(pick("article"));
		expect(store.snapshot().selected).toMatchObject({
			tagName: "article",
			selectedAt: 2_000,
			classRules: pick("article").classRules,
		});
		vi.useRealTimers();
	});
});
