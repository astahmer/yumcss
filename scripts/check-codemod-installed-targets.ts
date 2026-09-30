import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { proofSourceFingerprint } from "./proof-source-fingerprint.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const reportPath = resolve(repositoryRoot, "plans/evidence/codemod-installed-targets.json");
const proofRunnerPath = resolve(repositoryRoot, "scripts/verify-codemod-installed-targets.ts");
const digest = (content: string): string => createHash("sha256").update(content).digest("hex");

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy((): z.ZodType<JsonValue> =>
	z.union([
		z.null(),
		z.boolean(),
		z.number(),
		z.string(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);

const InstalledTargetProofReportSchema = z.strictObject({
	schema: z.literal("pandwind.codemod-installed-targets/2"),
	sourceFingerprint: z.string().regex(/^[\da-f]{64}$/u),
	proofImplementationHash: z.string().regex(/^[\da-f]{64}$/u),
	scope: z.string().min(1),
	reports: z.array(JsonValueSchema).min(1),
	reportFingerprint: z.string().regex(/^[\da-f]{64}$/u),
});

const report = InstalledTargetProofReportSchema.parse(JSON.parse(readFileSync(reportPath, "utf8")));
const reportBody = {
	schema: report.schema,
	sourceFingerprint: report.sourceFingerprint,
	proofImplementationHash: report.proofImplementationHash,
	scope: report.scope,
	reports: report.reports,
};
const currentSourceFingerprint = proofSourceFingerprint(repositoryRoot);
const currentProofImplementationHash = digest(readFileSync(proofRunnerPath, "utf8"));
const errors = [
	...(report.sourceFingerprint === currentSourceFingerprint
		? []
		: ["source fingerprint is stale; rerun the installed target proof"]),
	...(report.proofImplementationHash === currentProofImplementationHash
		? []
		: ["proof implementation hash is stale; rerun the installed target proof"]),
	...(report.reportFingerprint === digest(JSON.stringify(reportBody))
		? []
		: ["report fingerprint does not match its contents"]),
];

if (errors.length > 0) throw new Error(errors.join("; "));

console.log(
	`Installed target proof report is current (${report.reports.length} routes, ${report.sourceFingerprint}).`,
);
