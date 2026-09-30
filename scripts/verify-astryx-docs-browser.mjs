import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const { chromium } = await import("playwright-core");
const { PNG } = await import("pngjs");
const pixelmatchModule = await import("pixelmatch");
const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;

const baselineUrl = process.argv[2] ?? "http://127.0.0.1:4321";
const migratedUrl = process.argv[3] ?? "http://127.0.0.1:4322";
const reportPath = process.argv[4] ?? "/tmp/pandwind-astryx-proof/browser-parity.json";
const artifactRoot = reportPath.endsWith(".json")
	? reportPath.slice(0, -5)
	: `${reportPath}-artifacts`;
const visualDiffRatioLimit = 0.01;
const routes = [
	"/",
	"/docs",
	"/docs/browser-support",
	"/docs/cli-integrations",
	"/components",
	"/components/AppShell",
	"/blog",
	"/blog/astryx-v0-5-0",
	"/templates",
	"/templates/ai-chat",
	"/themes",
	"/playground",
];
const viewports = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "mobile", width: 390, height: 844 },
];

function comparableShape(value) {
	return JSON.stringify(value);
}

async function inspect(browser, baseUrl, route, viewport, lane) {
	const page = await browser.newPage({
		viewport: { width: viewport.width, height: viewport.height },
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	const errors = [];
	const failedResponses = [];
	const ignored = (url) => url.includes("/_vercel/");
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error" && !ignored(message.location().url)) errors.push(message.text());
	});
	page.on("response", (response) => {
		if (response.status() >= 400 && !ignored(response.url()))
			failedResponses.push([response.status(), response.url()]);
	});
	const response = await page.goto(`${baseUrl}${route}`, {
		waitUntil: "domcontentloaded",
		timeout: 30000,
	});
	await page.evaluate(() => document.fonts?.ready);
	// Client-loaded examples and the playground's compiled preview must settle
	// before capture; otherwise a cold dev server is compared against a ready
	// baseline and produces false visual/residual failures.
	await page.waitForTimeout(route === "/playground" ? 8000 : 4000);
	const shape = await page.evaluate(() => {
		const rect = (selector) => {
			const element = document.querySelector(selector);
			if (!element) return null;
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				display: style.display,
				width: Math.round(box.width),
				height: Math.round(box.height),
				paddingTop: style.paddingTop,
				paddingBottom: style.paddingBottom,
			};
		};
		const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
		return {
			title: document.title,
			bodyHeight: document.body.scrollHeight,
			main: rect("main"),
			homeMain: rect("#nd-home-layout > main"),
			footer: rect("footer"),
			layout: true,
			stylesheetLinks: links.length,
			linkedCssBytes: links.reduce((total, link) => total + Number(link.dataset.bytes ?? 0), 0),
			inlineCssBytes: [...document.querySelectorAll("style")].reduce(
				(total, style) => total + (style.textContent?.length ?? 0),
				0,
			),
			iframeCount: document.querySelectorAll("iframe").length,
		};
	});
	const linkedCssBytes = await page.evaluate(async () => {
		const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
		const bytes = await Promise.all(
			links.map(async (link) => {
				try {
					return (await (await fetch(link.href)).text()).length;
				} catch {
					return 0;
				}
			}),
		);
		return bytes.reduce((total, value) => total + value, 0);
	});
	shape.linkedCssBytes = linkedCssBytes;
	const screenshot = await page.screenshot({ fullPage: true });
	const screenshotPath = `${artifactRoot}/${lane}/${viewport.name}${route.replaceAll("/", "_") || "_home"}.png`;
	await mkdir(`${artifactRoot}/${lane}`, { recursive: true });
	await writeFile(screenshotPath, screenshot);
	await page.close();
	return {
		lane,
		route,
		viewport: viewport.name,
		status: response?.status() ?? 0,
		shape,
		errors,
		failedResponses,
		screenshotPath,
	};
}

function compareScreenshots(baseline, migrated) {
	const left = PNG.sync.read(readFileSync(baseline.screenshotPath));
	const right = PNG.sync.read(readFileSync(migrated.screenshotPath));
	const width = Math.max(left.width, right.width);
	const height = Math.max(left.height, right.height);
	const leftPadded = new PNG({ width, height });
	const rightPadded = new PNG({ width, height });
	PNG.bitblt(left, leftPadded, 0, 0, left.width, left.height, 0, 0);
	PNG.bitblt(right, rightPadded, 0, 0, right.width, right.height, 0, 0);
	const diff = new PNG({ width, height });
	const differingPixels = pixelmatch(leftPadded.data, rightPadded.data, diff.data, width, height, {
		threshold: 0.1,
		includeAA: false,
	});
	const diffPath = migrated.screenshotPath.replace(/\.png$/, ".diff.png");
	writeFileSync(diffPath, PNG.sync.write(diff));
	return {
		width,
		height,
		differingPixels,
		pixelRatio: differingPixels / (width * height),
		exact: differingPixels === 0 && left.width === right.width && left.height === right.height,
		diffPath,
	};
}

function canonicalIssue(item, origins) {
	if (typeof item === "string")
		return origins
			.reduce((value, origin) => value.replaceAll(origin, "<server>"), item)
			.split("\n", 1)[0];
	if (Array.isArray(item))
		return [
			item[0],
			origins.reduce((value, origin) => value.replace(origin, "<server>"), String(item[1])),
		];
	return item;
}

function newItems(baseline, migrated, origins) {
	const baselineItems = new Set(
		baseline.map((item) => JSON.stringify(canonicalIssue(item, origins))),
	);
	return migrated.filter(
		(item) => !baselineItems.has(JSON.stringify(canonicalIssue(item, origins))),
	);
}

const browser = await chromium.launch();
const baseline = [];
const migrated = [];
for (const viewport of viewports) {
	for (const route of routes) {
		baseline.push(await inspect(browser, baselineUrl, route, viewport, "baseline"));
		migrated.push(await inspect(browser, migratedUrl, route, viewport, "migrated"));
	}
}
await browser.close();

const comparisons = baseline.map((reference, index) => {
	const candidate = migrated[index];
	const screenshot = compareScreenshots(reference, candidate);
	const issueOrigins = [baselineUrl, migratedUrl];
	const newErrors = newItems(reference.errors, candidate.errors, issueOrigins);
	const newFailedResponses = newItems(
		reference.failedResponses,
		candidate.failedResponses,
		issueOrigins,
	);
	return {
		route: reference.route,
		viewport: reference.viewport,
		statusEqual: reference.status === candidate.status && candidate.status < 400,
		shapeEqual:
			comparableShape({
				...reference.shape,
				stylesheetLinks: undefined,
				linkedCssBytes: undefined,
				inlineCssBytes: undefined,
			}) ===
			comparableShape({
				...candidate.shape,
				stylesheetLinks: undefined,
				linkedCssBytes: undefined,
				inlineCssBytes: undefined,
			}),
		screenshot,
		visualEquivalent: screenshot.pixelRatio <= visualDiffRatioLimit,
		baseline: reference,
		migrated: candidate,
		newErrors,
		newFailedResponses,
		migratedCssDelta: candidate.shape.linkedCssBytes - reference.shape.linkedCssBytes,
	};
});
const report = {
	schema: "pandwind.astryx-docs-browser-report/1",
	baselineUrl,
	migratedUrl,
	routes,
	viewports,
	visualDiffRatioLimit,
	cssWithinBudget: comparisons.every((comparison) => comparison.migratedCssDelta <= 0),
	allRoutesEquivalent: comparisons.every(
		(comparison) =>
			comparison.statusEqual &&
			comparison.shapeEqual &&
			comparison.visualEquivalent &&
			comparison.newErrors.length === 0 &&
			comparison.newFailedResponses.length === 0,
	),
	allAcceptanceCriteriaPassed: comparisons.every(
		(comparison) =>
			comparison.statusEqual &&
			comparison.shapeEqual &&
			comparison.visualEquivalent &&
			comparison.newErrors.length === 0 &&
			comparison.newFailedResponses.length === 0 &&
			comparison.migratedCssDelta <= 0,
	),
	comparisons,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
	`${JSON.stringify(
		{
			allRoutesEquivalent: report.allRoutesEquivalent,
			cssWithinBudget: report.cssWithinBudget,
			allAcceptanceCriteriaPassed: report.allAcceptanceCriteriaPassed,
			comparisons: comparisons.length,
		},
		null,
	)}\n`,
);
