import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../examples/showcase/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const [baselineUrl, runtimeUrl, designUrl, baselineRoot, reportPath] = process.argv.slice(2);
if ([baselineUrl, runtimeUrl, designUrl, baselineRoot].some((value) => value === undefined))
	throw new Error(
		"usage: node scripts/verify-styled-components-docs.mjs BASELINE RUNTIME DESIGN BASELINE_NEXT_ROOT [REPORT]",
	);

const publicRoute = (route) =>
	!route.startsWith("/_") && !route.startsWith("/api/") && route !== "/test-error";

const routesFromBuild = async (root) => {
	const manifest = JSON.parse(await readFile(`${root}/.next/prerender-manifest.json`, "utf8"));
	return Object.keys(manifest.routes).filter(publicRoute).toSorted();
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const inspectHttp = async (baseUrl, routes, expectedStatuses) => {
	const cssCache = new Map();
	const statuses = {};
	const failures = [];
	let routeCssBytes = 0;
	let inlineStyleBytes = 0;
	let runtimeStyleBytes = 0;
	const htmlRoutes = [];
	for (const route of routes) {
		const response = await fetch(new URL(route, baseUrl));
		const html = await response.text();
		statuses[route] = response.status;
		const expected = expectedStatuses?.[route];
		if (expected !== undefined && expected !== response.status)
			failures.push({ route, reason: `HTTP ${response.status}; expected ${expected}` });
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
			routeCssBytes += cssCache.get(href);
		}
		for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
			const bytes = Buffer.byteLength(match[1]);
			inlineStyleBytes += bytes;
			if (match[0].includes("data-pandwind-runtime")) runtimeStyleBytes += bytes;
		}
	}
	return {
		routeCount: routes.length,
		htmlRoutes,
		statuses,
		failures,
		routeCssBytes,
		uniqueCssBytes: [...cssCache.values()].reduce((total, bytes) => total + bytes, 0),
		inlineStyleBytes,
		runtimeStyleBytes,
	};
};

const browserShape = async (browser, baseUrl, route) => {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.addInitScript(() => {
		// The reference homepage's cube advances from requestAnimationFrame even
		// under reduced motion. Preserve its SSR pose for deterministic parity.
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
	await page.goto(new URL(route, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => undefined);
	await page.evaluate(async () => {
		await Promise.all(
			[...document.images].map((image) => {
				if (image.complete) return image.decode().catch(() => undefined);
				return new Promise((resolve) => {
					const finish = () => {
						clearTimeout(timeout);
						resolve(undefined);
					};
					const timeout = setTimeout(finish, 2000);
					image.addEventListener("load", finish, { once: true });
					image.addEventListener("error", finish, { once: true });
				});
			}),
		);
	});
	await page.waitForTimeout(100);
	const screenshot = await page.screenshot({ fullPage: true });
	const shape = await page.evaluate(() => {
		const visibleText = (element) => {
			const clone = element.cloneNode(true);
			clone.querySelectorAll("style,script,noscript").forEach((node) => node.remove());
			return clone.textContent?.trim().slice(0, 120);
		};
		const describe = (selector) => {
			const element = document.querySelector(selector);
			if (!element) return null;
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				tag: element.tagName,
				text: visibleText(element),
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
			text: visibleText(document.body)?.replace(/\s+/g, " ").trim(),
			landmarks: ["main", "nav", "footer", "h1", "h2", "h3", "pre", "button"].map(describe),
			animatedImages: [...document.images]
				.filter((image) => /\.(?:gif|apng)(?:[?#]|$)/i.test(image.currentSrc || image.src))
				.map((image) => {
					const box = image.getBoundingClientRect();
					return {
						x: Math.max(0, Math.round(box.x)),
						y: Math.max(0, Math.round(box.y + window.scrollY)),
						width: Math.max(0, Math.round(box.width)),
						height: Math.max(0, Math.round(box.height)),
					};
				}),
			runtimeErrors: [...document.querySelectorAll("body *")].filter((element) =>
				/Application error|Unhandled Runtime Error/.test(element.textContent ?? ""),
			).length,
		};
	});
	let hydration = { tested: false, action: "none", ok: true };
	try {
		hydration = await page.evaluate(() => {
			const button = [...document.querySelectorAll("button")].find(
				(element) => !element.disabled && element.getClientRects().length > 0,
			);
			if (!button) return { tested: false, action: "none", ok: true };
			button.click();
			return { tested: true, action: "button.click", ok: true };
		});
		await page.waitForTimeout(50);
	} catch (error) {
		hydration = { tested: true, action: "button.click", ok: false, error: String(error) };
	}
	await page.close();
	return { ...shape, hydration, errors, screenshot, screenshotHash: sha256(screenshot) };
};

const compareScreenshots = async (page, baselineScreenshot, candidateScreenshot, masks) =>
	page.evaluate(
		async ({ baseline, candidate, masks: excluded }) => {
			const decode = (value) =>
				new Promise((resolve, reject) => {
					const image = new Image();
					image.onload = () => resolve(image);
					image.onerror = reject;
					image.src = `data:image/png;base64,${value}`;
				});
			const [first, second] = await Promise.all([decode(baseline), decode(candidate)]);
			if (first.width !== second.width || first.height !== second.height)
				return {
					width: first.width,
					height: first.height,
					changedPixels: first.width * first.height,
					changedPixelRatio: 1,
					maxChannelDelta: 255,
				};
			const canvas = document.createElement("canvas");
			canvas.width = first.width;
			canvas.height = first.height;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Canvas 2D context is unavailable");
			context.drawImage(first, 0, 0);
			const firstPixels = context.getImageData(0, 0, first.width, first.height).data;
			context.clearRect(0, 0, first.width, first.height);
			context.drawImage(second, 0, 0);
			const secondPixels = context.getImageData(0, 0, second.width, second.height).data;
			let changedPixels = 0;
			let maskedPixels = 0;
			let maxChannelDelta = 0;
			let minChangedX = first.width;
			let minChangedY = first.height;
			let maxChangedX = -1;
			let maxChangedY = -1;
			for (let index = 0; index < firstPixels.length; index += 4) {
				const pixel = index / 4;
				const x = pixel % first.width;
				const y = Math.floor(pixel / first.width);
				if (
					excluded.some(
						(mask) =>
							x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height,
					)
				) {
					maskedPixels += 1;
					continue;
				}
				let changed = false;
				for (let channel = 0; channel < 3; channel += 1) {
					const delta = Math.abs(firstPixels[index + channel] - secondPixels[index + channel]);
					maxChannelDelta = Math.max(maxChannelDelta, delta);
					changed ||= delta > 0;
				}
				if (changed) {
					changedPixels += 1;
					minChangedX = Math.min(minChangedX, x);
					minChangedY = Math.min(minChangedY, y);
					maxChangedX = Math.max(maxChangedX, x);
					maxChangedY = Math.max(maxChangedY, y);
				}
			}
			return {
				width: first.width,
				height: first.height,
				changedPixels,
				maskedPixels,
				changedPixelRatio: changedPixels / (first.width * first.height),
				maxChannelDelta,
				changedBounds:
					changedPixels === 0
						? null
						: {
								x: minChangedX,
								y: minChangedY,
								width: maxChangedX - minChangedX + 1,
								height: maxChangedY - minChangedY + 1,
							},
			};
		},
		{
			baseline: baselineScreenshot.toString("base64"),
			candidate: candidateScreenshot.toString("base64"),
			masks,
		},
	);

const routes = await routesFromBuild(baselineRoot);
const baseline = await inspectHttp(baselineUrl, routes);
const [runtime, design] = await Promise.all([
	inspectHttp(runtimeUrl, routes, baseline.statuses),
	inspectHttp(designUrl, routes, baseline.statuses),
]);
const browser = await chromium.launch();
const browserLanes = { baseline: {}, runtime: {}, design: {} };
for (const route of baseline.htmlRoutes) {
	browserLanes.baseline[route] = await browserShape(browser, baselineUrl, route);
	browserLanes.runtime[route] = await browserShape(browser, runtimeUrl, route);
	browserLanes.design[route] = await browserShape(browser, designUrl, route);
}
await browser.close();

const comparisonPageBrowser = await chromium.launch();
const comparisonPage = await comparisonPageBrowser.newPage({
	viewport: { width: 1440, height: 900 },
});
const browserComparisons = [];
for (const route of baseline.htmlRoutes) {
	const base = browserLanes.baseline[route];
	const runtimeCandidate = browserLanes.runtime[route];
	const designCandidate = browserLanes.design[route];
	const masks = [...base.animatedImages, ...runtimeCandidate.animatedImages];
	const designMasks = [...base.animatedImages, ...designCandidate.animatedImages];
	const runtimeScreenshotDiff = await compareScreenshots(
		comparisonPage,
		base.screenshot,
		runtimeCandidate.screenshot,
		masks,
	);
	const designScreenshotDiff = await compareScreenshots(
		comparisonPage,
		base.screenshot,
		designCandidate.screenshot,
		designMasks,
	);
	const screenshotEquivalent = (diff) =>
		diff.changedPixels <= 2000 && diff.changedPixelRatio <= 0.001;
	const shapeOf = ({
		screenshot: _screenshot,
		screenshotHash: _hash,
		errors: _errors,
		hydration: _hydration,
		animatedImages: _animatedImages,
		...shape
	}) => shape;
	const equivalent = (candidate, diff) =>
		JSON.stringify(shapeOf(base)) === JSON.stringify(shapeOf(candidate)) &&
		screenshotEquivalent(diff) &&
		candidate.errors.length === 0 &&
		candidate.runtimeErrors === 0 &&
		candidate.hydration.ok;
	browserComparisons.push({
		route,
		runtimeEquivalent: equivalent(runtimeCandidate, runtimeScreenshotDiff),
		designEquivalent: equivalent(designCandidate, designScreenshotDiff),
		baseline: shapeOf(base),
		runtime: shapeOf(runtimeCandidate),
		design: shapeOf(designCandidate),
		baselinePageErrors: base.errors,
		runtimePageErrors: runtimeCandidate.errors,
		designPageErrors: designCandidate.errors,
		runtimeHydration: runtimeCandidate.hydration,
		designHydration: designCandidate.hydration,
		runtimeScreenshotDiff,
		designScreenshotDiff,
	});
}
await comparisonPage.close();
await comparisonPageBrowser.close();

const totalBytes = (result) => result.uniqueCssBytes + result.inlineStyleBytes;
const report = {
	schema: "pandwind.styled-components-docs-verification/2",
	baselineUrl,
	runtimeUrl,
	designUrl,
	routeCount: routes.length,
	htmlRouteCount: baseline.htmlRoutes.length,
	baseline: { ...baseline, totalBytes: totalBytes(baseline) },
	runtime: { ...runtime, totalBytes: totalBytes(runtime) },
	design: { ...design, totalBytes: totalBytes(design) },
	runtimeTransferDelta: totalBytes(runtime) - totalBytes(baseline),
	designTransferDelta: totalBytes(design) - totalBytes(baseline),
	browserComparisons,
	allRuntimeRoutesEquivalent:
		runtime.failures.length === 0 &&
		browserComparisons.every((comparison) => comparison.runtimeEquivalent),
	allDesignRoutesEquivalent:
		design.failures.length === 0 &&
		browserComparisons.every((comparison) => comparison.designEquivalent),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, text);
process.stdout.write(text);
