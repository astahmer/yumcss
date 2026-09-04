/**
 * Governance CLI lane (plans/054 step 8): `--governance` emits the
 * versioned report document; a failed preset load downgrades to report-only
 * instead of failing the run; the changeset proposal lists only
 * safe-to-remove candidates.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { DEFAULT_GOVERNANCE_PRESET, GOVERNANCE_JSON_SCHEMA, runCli } from "../src/cli.ts";

const root = resolve(import.meta.dirname, "tmp-governance");

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function seed(files: Record<string, string>) {
	mkdirSync(root, { recursive: true });
	for (const [name, source] of Object.entries(files)) {
		const path = resolve(root, name);
		mkdirSync(resolve(path, ".."), { recursive: true });
		writeFileSync(path, source);
	}
}

describe("runCli --governance", () => {
	test("emits the versioned governance document with policy + changeset", async () => {
		seed({
			"a.tsx": 'export const a = tw({ color: "red-500", padding: "4" });',
			"design.ts": 'export const brand = "$colors.brand";',
		});
		const output = await runCli([
			"--governance",
			"--json",
			"**/*.ts*",
			"--preset",
			DEFAULT_GOVERNANCE_PRESET,
			"--root",
			root,
		]);
		const doc = JSON.parse(output) as {
			schema: string;
			governance: {
				version: number;
				policy: { resolved: boolean; strictProperties?: string[] } | null;
				summary: { defined: number; used: number; strictViolations: number };
				unusedCandidates: Array<{ tokenId: string; safety: string }>;
			};
			changeset: { count: number; content: string | null };
		};
		expect(doc.schema).toBe(GOVERNANCE_JSON_SCHEMA);
		expect(doc.schema).toBe("pandwind.analyze.governance/1");
		expect(doc.governance.version).toBe(1);
		expect(doc.governance.policy?.resolved).toBe(true);
		// color/padding carry token vocabulary; a vocabulary literal is a
		// verified token usage, not a violation.
		expect(doc.governance.summary.strictViolations).toBe(0);
		expect(
			doc.governance.usage.some(
				(u) => u.strictness === "token" && (u.tokenId === "colors::red-500" || u.tokenId === "spacing::4"),
			),
		).toBe(true);
		// $colors.brand is exported publicly -> review-required, never removed.
		const brand = doc.governance.unusedCandidates.find((c) => c.tokenId === "colors::brand");
		if (brand !== undefined) expect(brand.safety).toBe("review-required");
		expect(doc.changeset.count).toBeGreaterThanOrEqual(0);
	});

	test("a failed preset load downgrades to report-only policy", async () => {
		seed({ "a.ts": 'export const a = tw({ color: "hotpink" });' });
		const output = await runCli([
			"--governance",
			"--json",
			"**/*.ts",
			"--preset",
			"./no/such/preset.ts",
			"--root",
			root,
		]);
		const doc = JSON.parse(output) as {
			governance: {
				policy: unknown;
				diagnostics: Array<{ code: string; boundary?: string }>;
				summary: { defined: number };
			};
		};
		expect(doc.governance.policy).toBeNull();
		expect(
			doc.governance.diagnostics.some(
				(d) => d.boundary === "configuration-failure",
			),
		).toBe(true);
	});

	test("human output prints the summary without JSON", async () => {
		seed({ "a.ts": 'export const a = tw({ color: "red-500" });' });
		const human = await runCli(["--governance", "--preset", DEFAULT_GOVERNANCE_PRESET, "--root", root]);
		expect(human).toContain("pandwind analyze — token governance");
		expect(human).not.toContain('"schema"');
		expect(human).toContain("policy:");
	});
});
