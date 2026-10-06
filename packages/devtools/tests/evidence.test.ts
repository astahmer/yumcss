import { describe, expect, it } from "vitest";
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

	it("replaces the current element selection", () => {
		const store = createDevtoolsEvidenceStore("/project");
		store.select({
			tagName: "button",
			className: "pw-card",
			classNames: ["pw-card"],
			attributes: { type: "button" },
			computedStyles: { color: "red" },
			matchedFiles: ["src/Card.tsx"],
			matchedPrograms: ["card"],
		});
		expect(store.snapshot().selected).toEqual({
			tagName: "button",
			className: "pw-card",
			classNames: ["pw-card"],
			attributes: { type: "button" },
			computedStyles: { color: "red" },
			matchedFiles: ["src/Card.tsx"],
			matchedPrograms: ["card"],
		});
	});
});
