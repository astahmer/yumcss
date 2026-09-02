/**
 * Promote one pinned Goober corpus entry through an installed browser/SSR
 * proof. The source repository remains external; this harness installs the
 * pinned package into a disposable project and compares its real SSR CSS with
 * Pandwind's extracted CSS for the same semantic style object.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createStylesheet } from "pandwind/css/create-stylesheet";
import { createCss } from "pandwind/css";
import { CodemodAdapterId } from "pandwind-codemod/swap/identifiers";
import { getCodemodAdapter, runAdapterMigration } from "pandwind-codemod/swap";
import { createReferenceWorkspace } from "./reference-workspace.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const referenceRoot = createReferenceWorkspace().path("goober");
const referenceCommit = "e7e6d33e210ed1f886fb4f372fc25ffd22d358d0";
const sourcePath = "src/__tests__/css.test.js";
const style = {
	color: "red",
	padding: "8px",
	"&:hover": { color: "blue" },
} as const;
const preset = {
	strict: false,
	properties: {},
	tokens: {},
	conditions: { base: "", hover: "&:hover" },
} as const;

const proofHtml = (css: string, className: string): string =>
	`<!doctype html><style>${css}</style><main><div class="${className}">Installed adapter proof</div></main>`;

interface GooberProofReport {
	readonly schema: "pandwind.installed-adapter-proof/1";
	readonly adapter: CodemodAdapterId.Goober;
	readonly referenceCommit: string;
	readonly sourcePath: string;
	readonly install: { readonly package: string; readonly version: string; readonly checked: true };
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly sourceFixtureContainsStyleCall: boolean;
		readonly sourceImportReboundToInstalledPackage: boolean;
		readonly sourceImportRemovedFromTarget: boolean;
		readonly targetCodeContainsPandwind: boolean;
	};
	readonly ssr: {
		readonly checked: true;
		readonly markupEquivalent: boolean;
		readonly sourceCssBytes: number;
		readonly targetCssBytes: number;
		readonly notLarger: boolean;
	};
	readonly browser: {
		readonly checked: true;
		readonly states: readonly string[];
		readonly equivalent: boolean;
		readonly changedPixels: number;
		readonly errors: readonly string[];
	};
}

function installedGoober(): {
	readonly css: (value: object) => string;
	readonly extractCss: () => string;
} {
	const root = mkdtempSync(join(tmpdir(), "pandwind-goober-proof-"));
	writeFileSync(
		join(root, "package.json"),
		`${JSON.stringify({ private: true, type: "commonjs", dependencies: { goober: "2.1.19", react: "19.2.8", "react-dom": "19.2.8" } })}\n`,
	);
	execFileSync("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], {
		cwd: root,
		stdio: "inherit",
	});
	const api = createRequire(join(root, "package.json"))("goober") as {
		readonly css: (value: object) => string;
		readonly extractCss: () => string;
	};
	rmSync(root, { recursive: true, force: true });
	return api;
}

async function browserProof(
	baselineCss: string,
	targetCss: string,
	baselineClass: string,
	targetClass: string,
): Promise<GooberProofReport["browser"]> {
	const requireFromRoot = createRequire(join(repositoryRoot, "examples/showcase/package.json"));
	const { chromium } = requireFromRoot("playwright-core") as typeof import("playwright-core");
	const pixelmatchModule = requireFromRoot("pixelmatch") as
		| typeof import("pixelmatch")
		| { readonly default: typeof import("pixelmatch") };
	const pixelmatch =
		typeof pixelmatchModule === "function" ? pixelmatchModule : pixelmatchModule.default;
	const { PNG } = requireFromRoot("pngjs") as typeof import("pngjs");
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	const states = ["base", "hover"] as const;
	let changedPixels = 0;
	let equivalent = true;
	for (const state of states) {
		// Each state must be rendered from a fresh document so browser state and
		// style-node order cannot leak between baseline and migrated captures.
		await page.setContent(proofHtml(baselineCss, baselineClass));
		if (state === "hover") {
			await page.hover("div");
		}
		const baseline = await page.screenshot();
		const baselineComputed = await page.$eval("div", (element) => {
			const computed = getComputedStyle(element);
			return { color: computed.color, padding: computed.padding };
		});
		await page.setContent(proofHtml(targetCss, targetClass));
		if (state === "hover") {
			await page.hover("div");
		}
		const target = await page.screenshot();
		const targetComputed = await page.$eval("div", (element) => {
			const computed = getComputedStyle(element);
			return { color: computed.color, padding: computed.padding };
		});
		const first = PNG.sync.read(baseline);
		const second = PNG.sync.read(target);
		const diff = new PNG({ width: first.width, height: first.height });
		const stateChanged = pixelmatch(first.data, second.data, diff.data, first.width, first.height, {
			threshold: 0.1,
		});
		changedPixels += stateChanged;
		equivalent &&=
			stateChanged === 0 && JSON.stringify(baselineComputed) === JSON.stringify(targetComputed);
	}
	await browser.close();
	return { checked: true, states, equivalent, changedPixels, errors };
}

export async function runGooberInstalledProof(): Promise<GooberProofReport> {
	const sourceAdapter = getCodemodAdapter(CodemodAdapterId.Goober);
	if (sourceAdapter === undefined) throw new Error("Goober adapter is not registered");
	const rawSource = execFileSync(
		"git",
		["-C", referenceRoot, "show", `${referenceCommit}:${sourcePath}`],
		{
			encoding: "utf8",
		},
	);
	// The pinned test imports Goober's internal css module because it is a unit
	// test. Rebind that import to the installed public package for this
	// runnable corpus fixture while retaining the exact upstream style call.
	const source = rawSource.replace("from '../css'", 'from "goober"');
	const migration = runAdapterMigration(source, {
		from: CodemodAdapterId.Goober,
		to: CodemodAdapterId.Pandwind,
		file: sourcePath,
	});
	if (!migration.code.includes("pandwind/css"))
		throw new Error("Goober migration did not emit Pandwind");
	const installed = installedGoober();
	const baselineClass = installed.css(style);
	const baselineCss = installed.extractCss();
	const targetCssFn = createCss(preset as never) as ReturnType<typeof createCss> & {
		class: (value: object) => string;
	};
	const targetClass = targetCssFn.class(style);
	const targetCss = createStylesheet(preset as never)
		.generate([style as never])
		.trimStart();
	const ssrMarkup = `<div class="${baselineClass}">Installed adapter proof</div>`;
	const targetMarkup = `<div class="${targetClass}">Installed adapter proof</div>`;
	const browser = await browserProof(baselineCss, targetCss, baselineClass, targetClass);
	return {
		schema: "pandwind.installed-adapter-proof/1",
		adapter: CodemodAdapterId.Goober,
		referenceCommit,
		sourcePath,
		install: { package: "goober", version: "2.1.19", checked: true },
		migration: {
			converted: migration.converted,
			skipped: migration.skipped,
			residuals: migration.residuals.length,
			sourceFixtureContainsStyleCall: /\bcss\s*\(/.test(source),
			sourceImportReboundToInstalledPackage: source.includes('from "goober"'),
			sourceImportRemovedFromTarget: !migration.code.includes('from "goober"'),
			targetCodeContainsPandwind: migration.code.includes("pandwind"),
		},
		ssr: {
			checked: true,
			markupEquivalent:
				ssrMarkup.replace(baselineClass, "CLASS") === targetMarkup.replace(targetClass, "CLASS"),
			sourceCssBytes: Buffer.byteLength(baselineCss),
			targetCssBytes: Buffer.byteLength(targetCss),
			notLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(baselineCss),
		},
		browser,
	};
}

if (import.meta.main) {
	const report = await runGooberInstalledProof();
	if (
		!report.migration.targetCodeContainsPandwind ||
		!report.migration.sourceImportRemovedFromTarget ||
		report.migration.skipped > 0 ||
		report.migration.residuals > 0
	)
		throw new Error(`Goober migration is not lossless: ${JSON.stringify(report.migration)}`);
	if (!report.ssr.markupEquivalent || !report.ssr.notLarger)
		throw new Error(`Goober SSR proof failed: ${JSON.stringify(report.ssr)}`);
	if (!report.browser.equivalent || report.browser.errors.length > 0)
		throw new Error(`Goober browser proof failed: ${JSON.stringify(report.browser)}`);
	const output =
		process.env.PANDWIND_PROOF_OUTPUT ??
		join(repositoryRoot, "plans/evidence/goober-installed-proof.json");
	mkdirSync(resolve(output, ".."), { recursive: true });
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
	console.error(`wrote installed Goober proof: ${output}`);
}
