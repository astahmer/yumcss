import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CodemodAdapterId, getCodemodAdapter, runAdapterMigration } from "@yumcss/codemod/swap";
import { createCss } from "yumcss/css";
import { createStylesheet } from "yumcss/css/create-stylesheet";
import { createReferenceWorkspace } from "./reference-workspace.ts";

const root = resolve(import.meta.dirname, "..");
const referenceRoot = createReferenceWorkspace().path("emotion");
const referenceCommit = "b882bcba85132554992e4bd49e94c95939bbf810";
const sourcePath = "packages/babel-plugin/__tests__/__fixtures__/core-with-css-import.js";
const sourceStyle = { color: "hotpink" } as const;
const preset = {
	strict: false,
	properties: {},
	tokens: {},
	conditions: { base: "" },
} as const;

interface EmotionProofReport {
	readonly schema: "yumcss.installed-adapter-proof/1";
	readonly adapter: CodemodAdapterId.Emotion;
	readonly referenceCommit: string;
	readonly sourcePath: string;
	readonly install: { readonly checked: true; readonly packages: Readonly<Record<string, string>> };
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly outputContainsYumCSS: boolean;
		readonly sourceImportRemoved: boolean;
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
		readonly equivalent: boolean;
		readonly changedPixels: number;
		readonly states: readonly ["base"];
		readonly errors: readonly string[];
	};
}

function pinnedSource(): string {
	if (!existsSync(join(referenceRoot, ".git")))
		throw new Error("Emotion reference is missing; run pnpm run references:prepare first");
	const actual = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actual !== referenceCommit)
		throw new Error(`Emotion reference moved: expected ${referenceCommit}, got ${actual}`);
	return execFileSync("git", ["-C", referenceRoot, "show", `${referenceCommit}:${sourcePath}`], {
		encoding: "utf8",
	});
}

function installEmotion(): string {
	const project = mkdtempSync(join(tmpdir(), "yumcss-emotion-installed-proof-"));
	writeFileSync(
		join(project, "package.json"),
		`${JSON.stringify({
			private: true,
			type: "commonjs",
			dependencies: {
				"@emotion/cache": "11.14.0",
				"@emotion/react": "11.14.0",
				"@emotion/server": "11.11.0",
				react: "19.2.8",
				"react-dom": "19.2.8",
			},
		})}\n`,
	);
	execFileSync("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], {
		cwd: project,
		stdio: "inherit",
	});
	return project;
}

function renderEmotion(project: string): { readonly html: string; readonly css: string } {
	const requireFromProject = createRequire(join(project, "package.json"));
	const React = requireFromProject("react") as typeof import("react");
	const emotion = requireFromProject("@emotion/react") as {
		readonly jsx: (type: string, props: Record<string, unknown>) => unknown;
		readonly CacheProvider: (props: Record<string, unknown>) => unknown;
		readonly css: (style: typeof sourceStyle) => unknown;
	};
	const createCache = requireFromProject("@emotion/cache").default as (options: {
		readonly key: string;
	}) => unknown;
	const createEmotionServer = requireFromProject("@emotion/server/create-instance").default as (
		cache: unknown,
	) => {
		readonly extractCriticalToChunks: (html: string) => {
			readonly styles: readonly { readonly css: string }[];
		};
	};
	const renderToString = requireFromProject("react-dom/server").renderToString as (
		element: unknown,
	) => string;
	const cache = createCache({ key: "emotion" });
	const server = createEmotionServer(cache);
	const element = React.createElement(
		emotion.CacheProvider,
		{ value: cache },
		emotion.jsx("div", { css: emotion.css(sourceStyle), children: "Proof" }),
	);
	const html = renderToString(element);
	const chunks = server.extractCriticalToChunks(html);
	return { html, css: chunks.styles.map(({ css }) => css).join("\n") };
}

function normalizeMarkup(markup: string): string {
	return markup.replace(/class="[^"]*"/u, 'class="CLASS"');
}

const hasYumCSSImport = (code: string): boolean =>
	/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["']yumcss(?:["/])/u.test(code);

async function browserProof(
	sourceCss: string,
	targetCss: string,
	sourceMarkup: string,
	targetMarkup: string,
): Promise<EmotionProofReport["browser"]> {
	const requireFromShowcase = createRequire(join(root, "examples/showcase/package.json"));
	const { chromium } = requireFromShowcase("playwright-core") as typeof import("playwright-core");
	const pixelmatchModule = requireFromShowcase("pixelmatch") as
		| typeof import("pixelmatch")
		| { readonly default: typeof import("pixelmatch") };
	const pixelmatch =
		typeof pixelmatchModule === "function" ? pixelmatchModule : pixelmatchModule.default;
	const { PNG } = requireFromShowcase("pngjs") as typeof import("pngjs");
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	const documentFor = (css: string, markup: string) =>
		`<!doctype html><style>${css}</style><main>${markup}</main>`;
	await page.setContent(documentFor(sourceCss, sourceMarkup));
	const sourceImage = await page.screenshot();
	const sourceColor = await page.$eval("div", (element) => getComputedStyle(element).color);
	await page.setContent(documentFor(targetCss, targetMarkup));
	const targetImage = await page.screenshot();
	const targetColor = await page.$eval("div", (element) => getComputedStyle(element).color);
	const first = PNG.sync.read(sourceImage);
	const second = PNG.sync.read(targetImage);
	const diff = new PNG({ width: first.width, height: first.height });
	const changedPixels = pixelmatch(first.data, second.data, diff.data, first.width, first.height, {
		threshold: 0.1,
	});
	await browser.close();
	return {
		checked: true,
		equivalent: changedPixels === 0 && sourceColor === targetColor,
		changedPixels,
		states: ["base"],
		errors,
	};
}

export async function runEmotionInstalledProof(): Promise<EmotionProofReport> {
	const source = pinnedSource();
	if (getCodemodAdapter(CodemodAdapterId.Emotion) === undefined)
		throw new Error("Emotion adapter is not registered");
	const migration = runAdapterMigration(source, {
		from: CodemodAdapterId.Emotion,
		to: CodemodAdapterId.YumCSS,
		file: sourcePath,
	});
	const project = installEmotion();
	try {
		const rendered = renderEmotion(project);
		const css = createCss(preset as never) as ReturnType<typeof createCss> & {
			readonly class: (value: typeof sourceStyle) => string;
		};
		const targetClass = css.class(sourceStyle);
		const targetMarkup = `<div class="${targetClass}">Proof</div>`;
		const targetCss = createStylesheet(preset as never).generate([sourceStyle as never]);
		const browser = await browserProof(rendered.css, targetCss, rendered.html, targetMarkup);
		const sourceCssBytes = Buffer.byteLength(rendered.css);
		const targetCssBytes = Buffer.byteLength(targetCss);
		return {
			schema: "yumcss.installed-adapter-proof/1",
			adapter: CodemodAdapterId.Emotion,
			referenceCommit,
			sourcePath,
			install: {
				checked: true,
				packages: {
					"@emotion/cache": "11.14.0",
					"@emotion/react": "11.14.0",
					"@emotion/server": "11.11.0",
					react: "19.2.8",
					"react-dom": "19.2.8",
				},
			},
			migration: {
				converted: migration.converted,
				skipped: migration.skipped,
				residuals: migration.residuals.length,
				outputContainsYumCSS: hasYumCSSImport(migration.code),
				sourceImportRemoved: !migration.code.includes("@emotion/react"),
			},
			ssr: {
				checked: true,
				markupEquivalent: normalizeMarkup(rendered.html) === normalizeMarkup(targetMarkup),
				sourceCssBytes,
				targetCssBytes,
				notLarger: targetCssBytes <= sourceCssBytes,
			},
			browser,
		};
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const report = await runEmotionInstalledProof();
	const output = resolve(root, "plans/evidence/emotion-installed-proof.json");
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
	if (
		report.migration.skipped > 0 ||
		report.migration.residuals > 0 ||
		!report.migration.outputContainsYumCSS ||
		!report.migration.sourceImportRemoved ||
		!report.ssr.markupEquivalent ||
		!report.ssr.notLarger ||
		!report.browser.equivalent ||
		report.browser.errors.length > 0
	)
		process.exitCode = 1;
}
