import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createBuiltinCodemodCatalog,
	createRealRepositoryCorpus,
	RealRepositoryProofStatus,
} from "../src/swap/index.ts";

const corpus = createRealRepositoryCorpus();

describe("pinned real repository corpus", () => {
	test("keeps source provenance and residual evidence for three repositories", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/real-repository-migrations.json"),
				"utf8",
			),
		) as { schema: string; reports: Array<{ id: string; commit: string; path: string }> };
		expect(report.schema).toBe("pandwind.real-repository-report/1");
		expect(report.reports).toHaveLength(3);
		for (const fixture of corpus.inline) {
			expect(report.reports).toContainEqual(
				expect.objectContaining({ id: fixture.id, commit: fixture.commit, path: fixture.path }),
			);
		}
		expect(report.reports.some((item) => item.id === "panda-website-home")).toBe(true);
	});

	test("catalogs one pinned, cloned source file for every supported adapter", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/real-repository-migrations-v2.json"),
				"utf8",
			),
		) as {
			schema: string;
			sourceFiles: number;
			reports: Array<{ id: string; commit: string; path: string }>;
		};
		expect(report.schema).toBe("pandwind.real-repository-report/3");
		expect(report.sourceFiles).toBe(corpus.references.length);
		expect(
			new Set(corpus.references.map((reference) => reference.from)).size,
		).toBeGreaterThanOrEqual(16);
		for (const reference of corpus.references) {
			expect(reference.commit).toMatch(/^[0-9a-f]{40}$/);
			expect(report.reports).toContainEqual(
				expect.objectContaining({
					id: reference.id,
					commit: reference.commit,
					path: reference.path,
				}),
			);
		}
		const registeredSources = new Set(corpus.references.map((reference) => reference.from));
		for (const adapter of createBuiltinCodemodCatalog().adapters) {
			if (adapter.id === "pandwind" || adapter.id === "react-native") continue;
			expect(registeredSources.has(adapter.id)).toBe(true);
		}
	});

	test("records reproducible migration outcomes for every pinned source file", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/real-repository-migrations-v2.json"),
				"utf8",
			),
		) as {
			sourceFiles: number;
			reports: Array<{
				id: string;
				adapterRoute: string;
				detection: { matched: boolean; confidence: number };
				converted: number;
				skipped: number;
				residuals: number;
				runtimeBundleImpact: { measured: boolean; sourceRuntimePackages: string[] };
			}>;
			bundleImpact: { measured: boolean };
		};
		expect(report.sourceFiles).toBe(corpus.references.length);
		expect(report.reports.length).toBeGreaterThanOrEqual(corpus.references.length);
		expect(report.bundleImpact.measured).toBe(false);
		for (const reference of corpus.references) {
			const item = report.reports.find((candidate) => candidate.id === reference.id);
			expect(item).toBeDefined();
			expect(item?.adapterRoute).toBe(`${reference.from} -> ${reference.to}`);
			expect(item?.detection.matched).toBe(true);
			expect(item?.detection.confidence).toBeGreaterThan(0);
			expect(item?.converted).toBeGreaterThanOrEqual(0);
			expect(item?.skipped).toBeGreaterThanOrEqual(0);
			expect(item?.residuals).toBeGreaterThanOrEqual(0);
			expect(item?.runtimeBundleImpact.measured).toBe(false);
		}
	});

	test("classifies promotion evidence instead of overstating source-only proof", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/real-repository-migrations-v2.json"),
				"utf8",
			),
		) as {
			reports: Array<{
				id: string;
				promotion: {
					status: RealRepositoryProofStatus;
					eligible: boolean;
					dimensions: Record<string, { status: string }>;
				};
			}>;
		};
		const panda = report.reports.find((item) => item.id === "panda-website");
		const dynamic = report.reports.find(
			(item) => item.id === "next-yak-css-prop-benchmark-realistic-button",
		);
		const mismatch = report.reports.find(
			(item) => item.id === "next-yak-benchmark-realistic-button",
		);
		const vue = report.reports.find((item) => item.id === "vue-styled-css-test");
		expect(panda?.promotion.status).toBe(RealRepositoryProofStatus.PipelineUnpaired);
		expect(panda?.promotion.eligible).toBe(false);
		expect(dynamic?.promotion.status).toBe(RealRepositoryProofStatus.RuntimePending);
		expect(dynamic?.promotion.eligible).toBe(false);
		expect(mismatch?.promotion.status).toBe(RealRepositoryProofStatus.SourceStatic);
		expect(vue?.promotion.status).toBe(RealRepositoryProofStatus.SourceStatic);
		for (const reference of corpus.references) {
			const item = report.reports.find((candidate) => candidate.id === reference.id);
			expect(item?.promotion).toBeDefined();
			expect(item?.promotion.dimensions).toBeDefined();
		}
	});
});
