import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../examples/showcase/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const [baselineUrl, cssUrl, dcssUrl, twUrl, baselineRoot, reportPath] = process.argv.slice(2);
if ([baselineUrl, cssUrl, dcssUrl, twUrl, baselineRoot].some((value) => value === undefined))
	throw new Error(
		"usage: node scripts/verify-shadcn-v4.mjs BASELINE CSS DCSS TW BASELINE_NEXT_ROOT [REPORT]",
	);

const publicRoute = (route) => !route.startsWith("/_") && !route.startsWith("/api/");
const routesFromBuild = async (root) => {
	const manifest = JSON.parse(await readFile(`${root}/.next/prerender-manifest.json`, "utf8"));
	return Object.keys(manifest.routes).filter(publicRoute).toSorted();
};

const inspectHttp = async (baseUrl, routes, expectedStatuses) => {
	const cssCache = new Map();
	const statuses = {};
	const failures = [];
	const htmlRoutes = [];
	let linkedCssBytes = 0;
	let inlineStyleBytes = 0;
	let runtimeStyleBytes = 0;
	for (const route of routes) {
		const response = await fetch(new URL(route, baseUrl));
		const html = await response.text();
		statuses[route] = response.status;
		if (expectedStatuses?.[route] !== undefined && expectedStatuses[route] !== response.status)
			failures.push({
				route,
				reason: `HTTP ${response.status}; expected ${expectedStatuses[route]}`,
			});
		if (!response.ok) {
			failures.push({ route, reason: `HTTP ${response.status}` });
			continue;
		}
		if ((response.headers.get("content-type") ?? "").includes("text/html")) htmlRoutes.push(route);
		if (html.includes("Application error") || html.includes("Unhandled Runtime Error"))
			failures.push({ route, reason: "rendered application error" });
		for (const href of new Set(
			[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1]),
		)) {
			if (!cssCache.has(href)) {
				const stylesheet = await fetch(new URL(href, baseUrl));
				cssCache.set(href, stylesheet.ok ? Buffer.byteLength(await stylesheet.text()) : 0);
			}
			linkedCssBytes += cssCache.get(href);
		}
		for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
			const bytes = Buffer.byteLength(match[1]);
			inlineStyleBytes += bytes;
			if (match[0].includes("data-pandwind-runtime")) runtimeStyleBytes += bytes;
		}
	}
	return {
		routeCount: routes.length,
		htmlRouteCount: htmlRoutes.length,
		statuses,
		failures,
		linkedCssBytes,
		uniqueCssBytes: [...cssCache.values()].reduce((total, bytes) => total + bytes, 0),
		inlineStyleBytes,
		runtimeStyleBytes,
		totalCssBytes:
			[...cssCache.values()].reduce((total, bytes) => total + bytes, 0) + inlineStyleBytes,
	};
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const visualRoutes = [
	"/",
	"/docs",
	"/docs/components",
	"/blocks",
	"/colors",
	"/create",
	"/examples/dashboard",
	"/preview/base/preview",
	"/sera",
	"/typeset",
];

const inspectBrowser = async (browser, baseUrl, route) => {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.addInitScript(() => {
		globalThis.__scLogoRotation = {
			subscribe: () => () => undefined,
			start: () => undefined,
			stop: () => undefined,
			applyDrag: () => undefined,
		};
		let seed = 0x51ced;
		Math.random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 0x100000000;
		};
		const freezeAnimations = () => {
			const style = document.createElement("style");
			style.dataset.pandwindFreeze = "";
			style.textContent =
				"*,*::before,*::after{animation:none!important;animation-duration:0s!important;animation-delay:0s!important;transition:none!important;}";
			document.documentElement.append(style);
		};
		if (document.documentElement) freezeAnimations();
		else document.addEventListener("DOMContentLoaded", freezeAnimations, { once: true });
	});
	await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle", timeout: 30_000 });
	const shape = await page.evaluate(() => {
		const describe = (selector) => {
			const element = document.querySelector(selector);
			if (!element) return null;
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				tag: element.tagName,
				x: Math.round(box.x * 100) / 100,
				y: Math.round(box.y * 100) / 100,
				width: Math.round(box.width * 100) / 100,
				height: Math.round(box.height * 100) / 100,
				display: style.display,
				font: style.font,
				color: style.color,
				backgroundColor: style.backgroundColor,
			};
		};
		return {
			title: document.title,
			bodyHeight: document.body.scrollHeight,
			landmarks: ["main", "nav", "footer", "h1", "h2", "button"].map(describe),
			runtimeErrors: [...document.querySelectorAll("body *")].filter((element) =>
				/Application error|Unhandled Runtime Error/.test(element.textContent ?? ""),
			).length,
		};
	});
	const screenshot = await page.screenshot({ fullPage: true });
	let hydration = { tested: false, ok: true };
	try {
		hydration = await page.evaluate(() => {
			const button = [...document.querySelectorAll("button")].find(
				(element) => !element.disabled && element.getClientRects().length > 0,
			);
			if (!button) return { tested: false, ok: true };
			button.click();
			return { tested: true, ok: true };
		});
		await page.waitForTimeout(100);
	} catch (error) {
		hydration = { tested: true, ok: false, error: String(error) };
	}
	await page.close();
	return { ...shape, hydration, errors, screenshot, screenshotHash: sha256(screenshot) };
};

const compareScreenshots = async (page, baselineScreenshot, candidateScreenshot) =>
	page.evaluate(
		({ baseline, candidate }) =>
			new Promise((resolve, reject) => {
				const decode = (value) =>
					new Promise((done, fail) => {
						const image = new Image();
						image.addEventListener("load", () => done(image), { once: true });
						image.addEventListener("error", fail, { once: true });
						image.src = `data:image/png;base64,${value}`;
					});
				Promise.all([decode(baseline), decode(candidate)])
					.then(([first, second]) => {
						if (first.width !== second.width || first.height !== second.height)
							return resolve({
								width: first.width,
								height: first.height,
								changedPixels: first.width * first.height,
								changedPixelRatio: 1,
								maxChannelDelta: 255,
							});
						const canvas = document.createElement("canvas");
						canvas.width = first.width;
						canvas.height = first.height;
						const context = canvas.getContext("2d", { willReadFrequently: true });
						if (!context) throw new Error("Canvas 2D context is unavailable");
						context.drawImage(first, 0, 0);
						const firstPixels = context.getImageData(0, 0, first.width, first.height).data;
						context.clearRect(0, 0, canvas.width, canvas.height);
						context.drawImage(second, 0, 0);
						const secondPixels = context.getImageData(0, 0, second.width, second.height).data;
						let changedPixels = 0;
						let maxChannelDelta = 0;
						for (let index = 0; index < firstPixels.length; index += 4) {
							let changed = false;
							for (let channel = 0; channel < 3; channel += 1) {
								const delta = Math.abs(
									firstPixels[index + channel] - secondPixels[index + channel],
								);
								maxChannelDelta = Math.max(maxChannelDelta, delta);
								changed ||= delta > 0;
							}
							if (changed) changedPixels += 1;
						}
						resolve({
							width: first.width,
							height: first.height,
							changedPixels,
							changedPixelRatio: changedPixels / (first.width * first.height),
							maxChannelDelta,
						});
					})
					.catch(reject);
			}),
		{
			baseline: baselineScreenshot.toString("base64"),
			candidate: candidateScreenshot.toString("base64"),
		},
	);

const routes = await routesFromBuild(baselineRoot);
const baseline = await inspectHttp(baselineUrl, routes);
const candidates = {};
for (const [lane, url] of Object.entries({ css: cssUrl, dcss: dcssUrl, tw: twUrl }))
	candidates[lane] = await inspectHttp(url, routes, baseline.statuses);

const browser = await chromium.launch();
const comparePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const browserComparisons = [];
for (const route of visualRoutes) {
	const base = await inspectBrowser(browser, baselineUrl, route);
	const lanes = {};
	for (const [lane, url] of Object.entries({ css: cssUrl, dcss: dcssUrl, tw: twUrl })) {
		const candidate = await inspectBrowser(browser, url, route);
		const screenshot = await compareScreenshots(comparePage, base.screenshot, candidate.screenshot);
		const comparable = (value) => {
			const {
				screenshot: _screenshot,
				screenshotHash: _hash,
				errors: _errors,
				hydration: _hydration,
				...shape
			} = value;
			return shape;
		};
		const candidateErrors = candidate.errors.filter(
			(error) =>
				!error.startsWith("Failed to load resource: the server responded with a status of 404"),
		);
		lanes[lane] = {
			equivalent:
				JSON.stringify(comparable(base)) === JSON.stringify(comparable(candidate)) &&
				screenshot.changedPixels <= 100 &&
				screenshot.changedPixelRatio <= 0.0001 &&
				screenshot.maxChannelDelta <= 8 &&
				candidateErrors.length === 0 &&
				candidate.runtimeErrors === 0 &&
				candidate.hydration.ok,
			candidate: {
				...candidate,
				screenshot: undefined,
			},
			screenshot,
		};
	}
	browserComparisons.push({ route, baseline: { ...base, screenshot: undefined }, lanes });
}
await comparePage.close();
await browser.close();

const allExternalCssNotLarger = Object.values(candidates).every(
	(candidate) => candidate.uniqueCssBytes <= baseline.uniqueCssBytes,
);
const allCssNotLarger = Object.values(candidates).every(
	(candidate) => candidate.totalCssBytes <= baseline.totalCssBytes,
);

const report = {
	schema: "pandwind.shadcn-v4-browser-report/1",
	baselineUrl,
	lanes: { cssUrl, dcssUrl, twUrl },
	routeCount: routes.length,
	visualRouteCount: visualRoutes.length,
	baseline,
	candidates,
	browserPixelTolerance: {
		maxChangedPixels: 100,
		maxChangedPixelRatio: 0.0001,
		maxChannelDelta: 8,
	},
	browserComparisons,
	allHttpRoutesEquivalent: Object.values(candidates).every(
		(candidate) => candidate.failures.length === 0,
	),
	allExternalCssNotLarger,
	allCssNotLarger,
	allVisualRoutesEquivalent: browserComparisons.every((comparison) =>
		Object.values(comparison.lanes).every((lane) => lane.equivalent),
	),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, text);
process.stdout.write(text);
if (!allExternalCssNotLarger) process.exitCode = 1;
