import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	CodemodAdapterId,
	createRealRepositoryCorpus,
	runAdapterMigrationAsync,
} from "@yumcss/codemod/swap";
import { adapterReferenceProofFails } from "./adapter-reference-gate.ts";
import { createEffectToolingTaskRunner } from "./effect-tooling.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import {
	checkoutFileProvider,
	harnessModuleLoader,
	projectRootFor,
	readPinnedSource,
} from "./adapter-proof-harness.ts";

/**
 * Runs the strongest proof that is possible without installing arbitrary
 * upstream repositories. The distinction is intentional:
 *
 * - adapter-program proves a pinned upstream source excerpt, the adapter,
 *   YumCSS emission, canonical CSS, and the emitted CSS in Chromium;
 * - installed-repository promotion additionally proves the upstream build,
 *   runtime package, framework SSR, and application routes.
 *
 * This runner never upgrades the second claim implicitly. Its output is
 * evidence for the reusable adapter contract and a deterministic input for a
 * later installed-repository promotion runner.
 */
const PROOF_SCHEMA = "yumcss.adapter-reference-proof/1" as const;
const root = resolve(import.meta.dirname, "..");
const referencesRoot = createReferenceWorkspace().root;
const requireFromExample = createRequire(join(root, "examples/showcase/package.json"));
const { chromium } = requireFromExample("playwright-core") as typeof import("playwright-core");

function browserCss(canonical: string): string {
	// StyleProgram canonical selectors are rooted at `&`; a probe element gives
	// the browser a concrete subject while preserving conditions and ordering.
	return canonical.replaceAll("&", ".yumcss-proof-probe");
}

function declarationProperties(canonical: string): string[] {
	return [
		...new Set([...canonical.matchAll(/(?:^|[;{}])\s*([a-z-]+)\s*:/g)].map((match) => match[1]!)),
	];
}

async function proveInBrowser(
	validations: readonly CanonicalValidation[],
): Promise<ReferenceProofReport["browser"]> {
	if (validations.length === 0)
		return {
			checked: false,
			equivalent: false,
			hydrationEquivalent: false,
			samples: 0,
			errors: ["migration did not expose an adapter-level canonical CSS pair"],
		};
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	let equivalent = true;
	let hydrationEquivalent = true;
	let samples = 0;
	for (const validation of validations) {
		const sourceCss = browserCss(validation.canonicalSource);
		const targetCss = browserCss(validation.canonicalTarget);
		const properties = declarationProperties(validation.canonicalSource);
		const inspect = async (css: string) => {
			await page.setContent(
				`<!doctype html><style>${css}</style><main><div class="yumcss-proof-probe">proof</div></main>`,
			);
			return page.$eval(
				".yumcss-proof-probe",
				(element, names) => {
					const computed = getComputedStyle(element);
					return Object.fromEntries(
						(names as string[]).map((name) => [name, computed.getPropertyValue(name)]),
					);
				},
				properties,
			);
		};
		const sourceComputed = await inspect(sourceCss);
		const targetComputed = await inspect(targetCss);
		equivalent &&= JSON.stringify(sourceComputed) === JSON.stringify(targetComputed);

		await page.setContent(
			`<!doctype html><style id="proof-style">${targetCss}</style><main><div class="yumcss-proof-probe">proof</div></main>`,
		);
		const before = await page.$eval(
			".yumcss-proof-probe",
			(element, names) => {
				const computed = getComputedStyle(element);
				return Object.fromEntries(
					(names as string[]).map((name) => [name, computed.getPropertyValue(name)]),
				);
			},
			properties,
		);
		await page.evaluate(() => {
			const style = document.querySelector("#proof-style");
			if (style !== null) style.replaceWith(style.cloneNode(true));
		});
		const after = await page.$eval(
			".yumcss-proof-probe",
			(element, names) => {
				const computed = getComputedStyle(element);
				return Object.fromEntries(
					(names as string[]).map((name) => [name, computed.getPropertyValue(name)]),
				);
			},
			properties,
		);
		hydrationEquivalent &&= JSON.stringify(before) === JSON.stringify(after);
		samples++;
	}
	await browser.close();
	return {
		checked: true,
		equivalent,
		hydrationEquivalent,
		samples,
		errors,
	};
}

async function proveReference(
	reference: ReturnType<typeof createRealRepositoryCorpus>["references"][number],
): Promise<ReferenceProofReport> {
	const source = readPinnedSource(reference);
	const projectRoot = projectRootFor(reference);
	const checkout = join(referencesRoot, reference.clone);
	const migration = await runAdapterMigrationAsync(source, {
		from: reference.from,
		to: reference.to,
		file: reference.path,
		root: projectRoot,
		...checkoutFileProvider(checkout),
		moduleLoader: harnessModuleLoader,
		semantic: { source: { file: reference.path, framework: reference.framework } },
	});
	const validations = migration.validations as readonly CanonicalValidation[];
	const canonicalSource = validations.map((item) => item.canonicalSource).join("\n");
	const canonicalTarget = validations.map((item) => item.canonicalTarget).join("\n");
	const browser = await proveInBrowser(validations);
	return {
		id: reference.id,
		repository: reference.repository,
		commit: reference.commit,
		path: reference.path,
		adapter: reference.from,
		execution: "adapter-program",
		migration: {
			detected: migration.reports.length > 0 || migration.converted > 0,
			converted: migration.converted,
			skipped: migration.skipped,
			residuals: migration.residuals.length,
			validations: validations.length,
			residualSourcePreserved: migration.residuals.every(
				(residual) => !source.includes(residual.text) || migration.code.includes(residual.text),
			),
			sourcePreserved:
				migration.code
					.replaceAll(/\/\/ yumcss:migrate-skip[^\n]*\n/gu, "")
					.replaceAll(/\/\* yumcss:migrate-skip.*?\*\//gu, "")
					.trim() === source.trim(),
			valid:
				migration.residuals.length === 0 &&
				migration.skipped === 0 &&
				validations.every((item) => item.valid),
			differences: validations.flatMap((item) =>
				item.valid
					? []
					: [
							`canonical source: ${item.canonicalSource}`,
							`canonical target: ${item.canonicalTarget}`,
						],
			),
			residualKinds: Object.fromEntries(
				migration.residuals.reduce(
					(counts, residual) => counts.set(residual.kind, (counts.get(residual.kind) ?? 0) + 1),
					new Map<string, number>(),
				),
			),
			residualDetails: migration.residuals.map((residual) => ({
				kind: residual.kind,
				text: residual.text,
				...(residual.hint === undefined ? {} : { hint: residual.hint }),
			})),
		},
		canonicalCss: {
			checked: validations.length > 0,
			equal: validations.length > 0 && validations.every((item) => item.valid),
			sourceBytes: Buffer.byteLength(canonicalSource),
			targetBytes: Buffer.byteLength(canonicalTarget),
			notLarger: Buffer.byteLength(canonicalTarget) <= Buffer.byteLength(canonicalSource),
		},
		browser,
	};
}

async function run(): Promise<AdapterReferenceProofReport> {
	const excluded = {
		[CodemodAdapterId.Panda]:
			"Panda uses its project migration pipeline, not the file adapter route",
		[CodemodAdapterId.ReactNative]: "React Native requires the object-backend proof harness",
	} satisfies Readonly<Record<string, string>>;
	const references = createRealRepositoryCorpus().references.filter(
		(reference) => excluded[reference.from] === undefined,
	);
	const reports = await createEffectToolingTaskRunner().run(
		references.map((reference) => ({ id: reference.id, run: () => proveReference(reference) })),
		{ concurrency: 2 },
	);
	const passed = reports.filter(
		(report) =>
			report.migration.valid &&
			report.canonicalCss.equal &&
			report.canonicalCss.notLarger &&
			report.browser.equivalent &&
			report.browser.hydrationEquivalent &&
			report.browser.errors.length === 0,
	).length;
	return {
		schema: PROOF_SCHEMA,
		execution: "adapter-program",
		generatedAt: "deterministic",
		excluded,
		references: reports,
		passed,
		failed: reports.length - passed,
		regressions: reports.filter(adapterReferenceProofFails).length,
	};
}

if (import.meta.main) {
	const report = await run();
	const output =
		process.env.YUMCSS_ADAPTER_REFERENCE_PROOF_OUTPUT ??
		join(root, "plans/evidence/adapter-reference-proof.json");
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
	if (report.regressions > 0) process.exitCode = 1;
}
