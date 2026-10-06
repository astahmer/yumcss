import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const require = createRequire(new URL("../examples/showcase/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const deterministicImage = Buffer.from(
	"R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
	"base64",
);
const pixelChannelTolerance = 8;

const [baselineUrl, baselinePublicRoot, twUrl, cssUrl, designUrl, reportPath] =
	process.argv.slice(2);
if (
	[baselineUrl, baselinePublicRoot, twUrl, cssUrl, designUrl].some((value) => value === undefined)
) {
	throw new Error(
		"usage: node scripts/verify-posthog-docs.mjs BASELINE_URL BASELINE_PUBLIC_ROOT TW_URL CSS_URL DESIGN_URL [REPORT]",
	);
}

const routeFromFile = (root, file) => {
	const pathname = relative(root, file).replaceAll("\\", "/");
	if (pathname === "404.html" || pathname.startsWith("_")) return null;
	if (pathname === "index.html") return "/";
	if (pathname.endsWith("/index.html")) return `/${pathname.slice(0, -"index.html".length)}`;
	if (pathname.endsWith(".html")) return `/${pathname.slice(0, -".html".length)}`;
	return null;
};

const routesFromBuild = async (root) => {
	const routes = [];
	const visit = async (directory) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else {
				const route = routeFromFile(root, file);
				if (route !== null) routes.push(route);
			}
		}
	};
	await visit(root);
	return [...new Set(routes)].toSorted();
};

const cssStats = async (html, baseUrl) => {
	const css = new Map();
	for (const href of new Set(
		[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)].map(
			(match) => match[1],
		),
	)) {
		if (!css.has(href)) {
			const response = await fetch(new URL(href, baseUrl));
			css.set(href, response.ok ? Buffer.byteLength(await response.text()) : 0);
		}
	}
	let inlineStyleBytes = 0;
	for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g))
		inlineStyleBytes += Buffer.byteLength(match[1]);
	return {
		uniqueLinkedCssBytes: [...css.values()].reduce((total, bytes) => total + bytes, 0),
		inlineStyleBytes,
		totalCssBytes: [...css.values()].reduce((total, bytes) => total + bytes, 0) + inlineStyleBytes,
	};
};

const inspectHttp = async (baseUrl, routes, expectedStatuses) => {
	const statuses = {};
	const failures = [];
	let css = { uniqueLinkedCssBytes: 0, inlineStyleBytes: 0, totalCssBytes: 0 };
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
		if (/Application error|Unhandled Runtime Error/.test(html))
			failures.push({ route, reason: "rendered application error" });
		const routeCss = await cssStats(html, baseUrl);
		css = {
			uniqueLinkedCssBytes: css.uniqueLinkedCssBytes + routeCss.uniqueLinkedCssBytes,
			inlineStyleBytes: css.inlineStyleBytes + routeCss.inlineStyleBytes,
			totalCssBytes: css.totalCssBytes + routeCss.totalCssBytes,
		};
	}
	return { routeCount: routes.length, statuses, failures, css };
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const inspectBrowser = async (browser, baseUrl, route, options = {}) => {
	const viewport = options.viewport
		? { width: options.viewport.width, height: options.viewport.height }
		: { width: 1440, height: 900 };
	const context =
		options.javascriptEnabled === false
			? await browser.newContext({
					javaScriptEnabled: false,
					viewport,
				})
			: null;
	const page = context ? await context.newPage() : await browser.newPage({ viewport });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const origin = new URL(baseUrl).origin;
	await page.route("**/*", async (requestRoute) => {
		const request = requestRoute.request();
		if (request.resourceType() === "image" && new URL(request.url()).origin !== origin)
			await requestRoute.fulfill({ body: deterministicImage, contentType: "image/gif" });
		else await requestRoute.continue();
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error" && !/status of 404/.test(message.text()))
			errors.push(message.text());
	});
	await page.addInitScript(() => {
		let seed = 0x51f15e;
		const nextRandomByte = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed >>> 24;
		};
		Math.random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 0x100000000;
		};
		const randomBytes = (bytes) => {
			for (let index = 0; index < bytes.length; index += 1) bytes[index] = nextRandomByte();
			return bytes;
		};
		Object.defineProperty(crypto, "getRandomValues", {
			configurable: true,
			value: randomBytes,
		});
		Object.defineProperty(crypto, "randomUUID", {
			configurable: true,
			value: () => {
				const bytes = randomBytes(new Uint8Array(16));
				bytes[6] = (bytes[6] & 0x0f) | 0x40;
				bytes[8] = (bytes[8] & 0x3f) | 0x80;
				return [...bytes]
					.map(
						(byte, index) =>
							`${byte.toString(16).padStart(2, "0")}${[3, 5, 7, 9].includes(index) ? "-" : ""}`,
					)
					.join("");
			},
		});
		const fixedNow = 1_725_000_000_000;
		Object.defineProperty(Date, "now", { configurable: true, value: () => fixedNow });
		const freeze = () => {
			const style = document.createElement("style");
			style.textContent =
				"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;}";
			document.documentElement.append(style);
		};
		if (document.documentElement) freeze();
		else document.addEventListener("DOMContentLoaded", freeze, { once: true });
	});
	await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle", timeout: 30_000 });
	// Warm lazy media before full-page capture; otherwise capture scrolling can race
	// below-the-fold image loading and make the unchanged baseline disagree with itself.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await new Promise((resolve) => setTimeout(resolve, 500));
	await page.evaluate(() => window.scrollTo(0, 0));
	await new Promise((resolve) => setTimeout(resolve, 100));
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
	await page.close();
	if (context) await context.close();
	return { ...shape, errors, screenshot, screenshotHash: sha256(screenshot) };
};

const compareScreenshots = async (page, baseline, candidate) =>
	page.evaluate(
		({ baseline: firstBytes, candidate: secondBytes, tolerance }) =>
			new Promise((resolve, reject) => {
				const decode = (value) =>
					new Promise((done, fail) => {
						const image = new Image();
						image.addEventListener("load", () => done(image), { once: true });
						image.addEventListener("error", fail, { once: true });
						image.src = `data:image/png;base64,${value}`;
					});
				Promise.all([decode(firstBytes), decode(secondBytes)])
					.then(([first, second]) => {
						if (first.width !== second.width || first.height !== second.height)
							return resolve({
								changedPixels: first.width * first.height,
								rawChangedPixels: first.width * first.height,
								changedPixelRatio: 1,
								rawChangedPixelRatio: 1,
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
						let rawChangedPixels = 0;
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
							if (changed) rawChangedPixels += 1;
							let significant = false;
							for (let channel = 0; channel < 3; channel += 1) {
								significant ||=
									Math.abs(firstPixels[index + channel] - secondPixels[index + channel]) >
									tolerance;
							}
							if (significant) changedPixels += 1;
						}
						resolve({
							changedPixels,
							rawChangedPixels,
							changedPixelRatio: changedPixels / (first.width * first.height),
							rawChangedPixelRatio: rawChangedPixels / (first.width * first.height),
							maxChannelDelta,
						});
					})
					.catch(reject);
			}),
		{
			baseline: baseline.toString("base64"),
			candidate: candidate.toString("base64"),
			tolerance: pixelChannelTolerance,
		},
	);

const browserErrorKey = (error) => error.split("\n", 1)[0];
const introducedBrowserErrors = (baseline, candidate) => {
	const remaining = new Map();
	for (const error of baseline) {
		const key = browserErrorKey(error);
		remaining.set(key, (remaining.get(key) ?? 0) + 1);
	}
	return candidate.filter((error) => {
		const key = browserErrorKey(error);
		const count = remaining.get(key) ?? 0;
		if (count === 0) return true;
		remaining.set(key, count - 1);
		return false;
	});
};

const routes = await routesFromBuild(baselinePublicRoot);
if (routes.length === 0) throw new Error(`no Gatsby HTML routes found in ${baselinePublicRoot}`);
const laneUrls = { tw: twUrl, css: cssUrl, design: designUrl };
const baseline = await inspectHttp(baselineUrl, routes);
const lanes = {};
for (const [lane, url] of Object.entries(laneUrls))
	lanes[lane] = await inspectHttp(url, routes, baseline.statuses);

const browser = await chromium.launch({
	headless: true,
	...(process.env.PW_BROWSER ||
	existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
		? {
				executablePath:
					process.env.PW_BROWSER ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			}
		: {}),
});
const comparePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const visualRoutes = routes
	.filter((route) => ["/", "/docs/", "/blog/", "/pricing/"].includes(route))
	.slice(0, 10);
const visualViewports = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "mobile", width: 390, height: 844 },
];
const browserComparisons = [];
for (const route of visualRoutes) {
	for (const viewport of visualViewports) {
		const reference = await inspectBrowser(browser, baselineUrl, route, { viewport });
		const referenceSsr = await inspectBrowser(browser, baselineUrl, route, {
			javascriptEnabled: false,
			viewport,
		});
		const candidate = {};
		for (const [lane, url] of Object.entries(laneUrls)) {
			const result = await inspectBrowser(browser, url, route, { viewport });
			const resultSsr = await inspectBrowser(browser, url, route, {
				javascriptEnabled: false,
				viewport,
			});
			const introducedErrors = introducedBrowserErrors(reference.errors, result.errors);
			const screenshot = await compareScreenshots(
				comparePage,
				reference.screenshot,
				result.screenshot,
			);
			const ssrScreenshot = await compareScreenshots(
				comparePage,
				referenceSsr.screenshot,
				resultSsr.screenshot,
			);
			const comparable = (value) => {
				const { screenshot: _screenshot, screenshotHash: _hash, errors: _errors, ...shape } = value;
				return shape;
			};
			candidate[lane] = {
				// SSR pixels are the static-style contract. Hydrated pages still need
				// equivalent landmarks and no newly introduced browser/runtime errors,
				// but upstream JS animations are intentionally not treated as CSS drift.
				equivalent:
					JSON.stringify(comparable(reference)) === JSON.stringify(comparable(result)) &&
					ssrScreenshot.changedPixels === 0 &&
					introducedErrors.length === 0 &&
					result.runtimeErrors === 0,
				screenshot,
				ssrScreenshot,
				errors: result.errors,
				introducedErrors,
			};
		}
		browserComparisons.push({ route, viewport: viewport.name, lanes: candidate });
	}
}
await comparePage.close();
await browser.close();

const report = {
	schema: "yumcss.posthog-docs-browser-report/1",
	routeCount: routes.length,
	visualRouteCount: browserComparisons.length,
	baseline,
	lanes,
	browserComparisons,
	allHttpRoutesEquivalent: Object.values(lanes).every((lane) => lane.failures.length === 0),
	allCssNotLarger: Object.values(lanes).every(
		(lane) => lane.css.totalCssBytes <= baseline.css.totalCssBytes,
	),
	allVisualRoutesEquivalent: browserComparisons.every((comparison) =>
		Object.values(comparison.lanes).every((lane) => lane.equivalent),
	),
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, output);
process.stdout.write(output);
if (!report.allHttpRoutesEquivalent || !report.allCssNotLarger || !report.allVisualRoutesEquivalent)
	process.exitCode = 1;
