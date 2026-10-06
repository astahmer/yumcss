import { proofSourceFingerprint } from "../../../scripts/proof-source-fingerprint.ts";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { CodemodAdapterId, officialApiCases } from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	expectExplicitResidualEvidence,
	expectRouteScenarioEvidence,
} from "./route-spec-support.ts";

const auditedAdapters = [
	CodemodAdapterId.ChakraUi,
	CodemodAdapterId.Tailwind,
	CodemodAdapterId.StyleX,
	CodemodAdapterId.YumCSS,
	CodemodAdapterId.Tokenami,
	CodemodAdapterId.UnoCSS,
	CodemodAdapterId.StyledComponents,
	CodemodAdapterId.Mui,
	CodemodAdapterId.Panda,
];

test("captures configured and missing-context audit scenarios with explicit outcomes", async () => {
	const cases = officialApiCases();
	const scenarios = [];
	for (const adapter of auditedAdapters) {
		const sourceCase = cases.find((candidate) => candidate.adapter === adapter);
		const yumcssCase = cases.find((candidate) => candidate.adapter === CodemodAdapterId.YumCSS);
		expect(sourceCase).toBeDefined();
		expect(yumcssCase).toBeDefined();
		if (sourceCase === undefined || yumcssCase === undefined)
			throw new Error("missing audit fixture");
		for (const route of [
			{ from: adapter, to: CodemodAdapterId.YumCSS, fixture: sourceCase },
			{ from: CodemodAdapterId.YumCSS, to: adapter, fixture: yumcssCase },
		]) {
			if (route.from === route.to) continue;
			for (const configuration of ["missing", "configured-blue", "configured-amber"] as const) {
				const project =
					configuration === "missing"
						? undefined
						: createAdapterRouteProject(
								route.from,
								route.to,
								configuration === "configured-blue" ? "#2563eb" : "#f97316",
							);
				const result = await createAdapterRouteSpec(route.from, route.to).runAsync({
					source: route.fixture.source,
					file: route.fixture.file,
					project,
					semantic: { source: { framework: "react" } },
				});

				const residualKinds = [
					...new Set(result.residuals.map((residual) => residual.kind)),
				].toSorted();
				const missingUnoSource =
					configuration === "missing" && route.from === CodemodAdapterId.UnoCSS;
				const missingUnoTarget =
					configuration === "missing" && route.to === CodemodAdapterId.UnoCSS;
				const hostlessMui = route.to === CodemodAdapterId.Mui;
				const unrecognizedChakra =
					configuration === "missing" && route.from === CodemodAdapterId.ChakraUi;
				if (missingUnoSource || missingUnoTarget || hostlessMui) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(1);
					expect(residualKinds).toEqual(
						missingUnoSource
							? ["unknown-utility"]
							: missingUnoTarget
								? ["configuration", "validation"]
								: ["host-framework"],
					);
					expect(result.code.replace(/^\/\/ yumcss:migrate-skip[^\n]*\n/gmu, "")).toBe(
						route.fixture.source,
					);
				} else if (unrecognizedChakra) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(0);
					expect(result.residuals).toEqual([]);
					expect(result.code).toBe(route.fixture.source);
				} else {
					expect(result.converted).toBe(1);
					expect(result.skipped).toBe(0);
					expect(result.residuals).toEqual([]);
				}
				if (
					result.changed ||
					result.converted > 0 ||
					result.skipped > 0 ||
					result.residuals.length > 0
				)
					expectRouteScenarioEvidence(result, `${route.from} -> ${route.to} ${configuration}`);
				else {
					expect(configuration).toBe("missing");
					expect(result.code).toBe(route.fixture.source);
				}
				expectExplicitResidualEvidence(result);
				if (result.converted > 0 && result.skipped === 0 && result.residuals.length === 0)
					expect(result.validations.every((validation) => validation.valid)).toBe(true);
				scenarios.push({
					route: { from: route.from, to: route.to },
					configuration,
					disposition:
						result.converted > 0
							? "converted"
							: result.residuals.length > 0
								? "residual"
								: "source-preserved-without-recognition",
					inputFile: route.fixture.file,
					input: route.fixture.source,
					converted: result.converted,
					skipped: result.skipped,
					residuals: result.residuals,
					canonical: result.validations,
					generatedFiles: result.generatedFiles.map((file) => file.path),
				});
			}
		}
	}
	expect(scenarios).toHaveLength(48);
	if (process.env.YUMCSS_REFRESH_AUDIT_EVIDENCE !== "1") return;
	const repositoryRoot = resolve(import.meta.dirname, "../../..");
	writeFileSync(
		resolve(repositoryRoot, "plans/evidence/codemod-configured-audit.json"),
		`${JSON.stringify(
			{
				schema: "yumcss.codemod-configured-audit/1",
				sourceFingerprint: proofSourceFingerprint(repositoryRoot),
				sourceRevision: execFileSync("jj", ["log", "-r", "@", "--no-graph", "-T", "commit_id"], {
					cwd: repositoryRoot,
					encoding: "utf8",
				}).trim(),
				scope:
					"48 primary route scenarios across eight foreign audited families and YumCSS. Configured cases use injected fixture configuration ports; target installation is proved separately. Identity routes excluded.",
				scenarios,
			},
			null,
			2,
		)}\n`,
	);
}, 60_000);
