import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	CodemodAdapterId,
	createRealRepositoryCorpus,
	runAdapterMigrationAsync,
} from "pandwind-codemod/swap";
import { createEffectToolingTaskRunner } from "./effect-tooling.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";

/**
 * Runs the strongest proof that is possible without installing arbitrary
 * upstream repositories. The distinction is intentional:
 *
 * - adapter-program proves a pinned upstream source excerpt, the adapter,
 *   Pandwind emission, canonical CSS, and the emitted CSS in Chromium;
 * - installed-repository promotion additionally proves the upstream build,
 *   runtime package, framework SSR, and application routes.
 *
 * This runner never upgrades the second claim implicitly. Its output is
 * evidence for the reusable adapter contract and a deterministic input for a
 * later installed-repository promotion runner.
 */
const PROOF_SCHEMA = "pandwind.adapter-reference-proof/1" as const;
const root = resolve(import.meta.dirname, "..");
const referencesRoot = createReferenceWorkspace().root;
const requireFromExample = createRequire(join(root, "examples/showcase/package.json"));
const { chromium } = requireFromExample("playwright-core") as typeof import("playwright-core");

interface CanonicalValidation {
	readonly canonicalSource: string;
	readonly canonicalTarget: string;
	readonly valid: boolean;
}

interface ReferenceProofReport {
	readonly id: string;
	readonly repository: string;
	readonly commit: string;
	readonly path: string;
	readonly adapter: string;
	readonly execution: "adapter-program";
	readonly migration: {
		readonly detected: boolean;
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly validations: number;
		readonly valid: boolean;
		readonly differences: readonly string[];
		readonly residualKinds: Readonly<Record<string, number>>;
		readonly residualDetails: readonly {
			readonly kind: string;
			readonly text: string;
			readonly hint?: string;
		}[];
	};
	readonly canonicalCss: {
		readonly checked: boolean;
		readonly equal: boolean;
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly notLarger: boolean;
	};
	readonly browser: {
		readonly checked: boolean;
		readonly equivalent: boolean;
		readonly hydrationEquivalent: boolean;
		readonly samples: number;
		readonly errors: readonly string[];
	};
}

interface AdapterReferenceProofReport {
	readonly schema: typeof PROOF_SCHEMA;
	readonly execution: "adapter-program";
	readonly generatedAt: "deterministic";
	readonly excluded: Readonly<Record<string, string>>;
	readonly references: readonly ReferenceProofReport[];
	readonly passed: number;
	readonly failed: number;
}

function readPinnedSource(
	reference: ReturnType<typeof createRealRepositoryCorpus>["references"][number],
): string {
	const checkout = join(referencesRoot, reference.clone);
	const actual = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actual !== reference.commit)
		throw new Error(`${reference.clone} moved: expected ${reference.commit}, got ${actual}`);
	return execFileSync("git", ["-C", checkout, "show", `${reference.commit}:${reference.path}`], {
		encoding: "utf8",
	});
}

function projectRootFor(
	reference: ReturnType<typeof createRealRepositoryCorpus>["references"][number],
): string {
	const checkout = join(referencesRoot, reference.clone);
	let directory = dirname(join(checkout, reference.path));
	while (directory.startsWith(checkout)) {
		if (existsSync(join(directory, "package.json"))) return directory;
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return checkout;
}

function browserCss(canonical: string): string {
	// StyleProgram canonical selectors are rooted at `&`; a probe element gives
	// the browser a concrete subject while preserving conditions and ordering.
	return canonical.replaceAll("&", ".pandwind-proof-probe");
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
				`<!doctype html><style>${css}</style><main><div class="pandwind-proof-probe">proof</div></main>`,
			);
			return page.$eval(
				".pandwind-proof-probe",
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
			`<!doctype html><style id="proof-style">${targetCss}</style><main><div class="pandwind-proof-probe">proof</div></main>`,
		);
		const before = await page.$eval(
			".pandwind-proof-probe",
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
			".pandwind-proof-probe",
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
	const migration = await runAdapterMigrationAsync(source, {
		from: reference.from,
		to: reference.to,
		file: reference.path,
		root: projectRoot,
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
	};
}

if (import.meta.main) {
	const report = await run();
	const output =
		process.env.PANDWIND_ADAPTER_REFERENCE_PROOF_OUTPUT ??
		join(root, "plans/evidence/adapter-reference-proof.json");
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
	if (report.failed > 0) process.exitCode = 1;
}
