import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(new URL("../examples/showcase/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const routes = ["/", "/docs/learn/", "/docs/api/", "/playground"];
const baselineUrl = process.argv[2] ?? "http://127.0.0.1:4311";
const migratedUrl = process.argv[3] ?? "http://127.0.0.1:4310";
const reportPath = process.argv[4];

async function inspect(browser, baseUrl, route) {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const errors = [];
	const failedResponses = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("response", (response) => {
		if (response.status() >= 400) failedResponses.push([response.status(), response.url()]);
	});
	await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
	await page.waitForTimeout(route === "/playground" ? 7000 : 1200);
	const result = await page.evaluate(async (currentRoute) => {
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
			};
		};
		const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
		const linkedCssBytes = await Promise.all(
			links.map(async (link) => (await (await fetch(link.href)).text()).length),
		);
		return {
			title: document.title,
			bodyHeight: document.body.scrollHeight,
			main: rect("main"),
			homeMain: rect("#nd-home-layout > main"),
			footer: rect("footer"),
			stylesheetLinks: links.length,
			linkedCssBytes: linkedCssBytes.reduce((total, bytes) => total + bytes, 0),
			inlineCssBytes: [...document.querySelectorAll("style")].reduce(
				(total, style) => total + style.textContent.length,
				0,
			),
			playgroundFrameUrls:
				currentRoute === "/playground"
					? [...document.querySelectorAll("iframe")].map((frame) => frame.src)
					: null,
		};
	}, route);
	if (route === "/playground") {
		const renderedFrames = await Promise.all(
			page.frames().map(async (frame) => {
				if (!frame.url().includes("sandpack")) return false;
				try {
					return Boolean((await frame.locator("#root").first().textContent())?.length);
				} catch {
					return false;
				}
			}),
		);
		result.playgroundRendered = renderedFrames.some(Boolean);
	}
	await page.close();
	return { ...result, errors, failedResponses };
}

const browser = await chromium.launch();
const lanes = {
	baseline: [],
	migrated: [],
};
for (const route of routes) {
	lanes.baseline.push(await inspect(browser, baselineUrl, route));
	lanes.migrated.push(await inspect(browser, migratedUrl, route));
}
await browser.close();

const comparisons = routes.map((route, index) => {
	const baseline = lanes.baseline[index];
	const migrated = lanes.migrated[index];
	const shapeEqual =
		baseline.bodyHeight === migrated.bodyHeight &&
		JSON.stringify(baseline.main) === JSON.stringify(migrated.main) &&
		JSON.stringify(baseline.homeMain) === JSON.stringify(migrated.homeMain) &&
		JSON.stringify(baseline.footer) === JSON.stringify(migrated.footer);
	return {
		route,
		shapeEqual,
		baseline,
		migrated,
		migratedCssDelta: migrated.linkedCssBytes - baseline.linkedCssBytes,
	};
});

const report = {
	schema: "yumcss.stylex-docs-browser-report/1",
	baselineUrl,
	migratedUrl,
	allRoutesEquivalent: comparisons.every(
		(comparison) =>
			comparison.shapeEqual &&
			comparison.migrated.errors.length === 0 &&
			comparison.migrated.failedResponses.length === 0 &&
			(comparison.migrated.playgroundRendered ?? true),
	),
	comparisons,
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, text);
process.stdout.write(text);
