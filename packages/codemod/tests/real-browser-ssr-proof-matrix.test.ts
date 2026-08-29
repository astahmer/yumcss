import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

interface ProofMatrix {
	readonly schema: string;
	readonly claims: readonly {
		readonly id: string;
		readonly referenceCommit: string;
		readonly report: string;
		readonly server: {
			readonly checked: boolean;
			readonly routes: number;
			readonly failures: number;
		};
		readonly browser: {
			readonly checked: boolean;
			readonly routes: number;
			readonly equivalent: boolean;
			readonly errors: number;
		};
		readonly css: {
			readonly baselineBytes: number;
			readonly migratedBytes: number;
			readonly notLarger: boolean;
		};
	}[];
}

const repositoryRoot = resolve(import.meta.dirname, "../../../");
const matrixPath = resolve(repositoryRoot, "plans/evidence/real-browser-ssr-proof-matrix.json");

describe("real browser/server proof matrix", () => {
	test("every claimed repository has pinned, executable, non-regressing evidence", () => {
		const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as ProofMatrix;
		expect(matrix.schema).toBe("pandwind.real-browser-ssr-proof-matrix/1");
		expect(matrix.claims).toHaveLength(5);
		expect(new Set(matrix.claims.map((claim) => claim.id)).size).toBe(matrix.claims.length);

		for (const claim of matrix.claims) {
			expect(claim.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
			expect(claim.server).toMatchObject({ checked: true, failures: 0 });
			expect(claim.server.routes).toBeGreaterThan(0);
			expect(claim.browser).toMatchObject({ checked: true, equivalent: true, errors: 0 });
			expect(claim.browser.routes).toBeGreaterThan(0);
			expect(claim.css).toMatchObject({ notLarger: true });
			expect(claim.css.migratedBytes).toBeLessThanOrEqual(claim.css.baselineBytes);
			expect(existsSync(resolve(repositoryRoot, claim.report))).toBe(true);
		}
	});
});
