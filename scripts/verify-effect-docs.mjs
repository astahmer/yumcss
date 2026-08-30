/**
 * Differential proof for the Effect website corpus.
 *
 * The baseline and candidates are disposable Astro builds. This verifier does
 * not compare generated asset names or CSS-in-JS injection topology; it checks
 * the observable contract: routes, emitted CSS size, SSR HTML, browser state,
 * hydration errors, and rendered pixels.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const [baselineRoot, twRoot, cssRoot, designRoot, reportPath] = process.argv.slice(2);
if ([baselineRoot, twRoot, cssRoot, designRoot].some((value) => value === undefined))
	throw new Error(
		"usage: node scripts/verify-effect-docs.mjs BASELINE_CLIENT TW_CLIENT CSS_CLIENT DESIGN_CLIENT [REPORT]",
	);

const require = createRequire(new URL(`${baselineRoot}/package.json`, "file://"));
const { chromium } = require("playwright");
const deterministicImage = Buffer.from(
	"R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
	"base64",
);
const pixelTolerance = 8;

const mimeTypes = {
	".css": "text/css",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".json": "application/json",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

const serve = async (root) => {
	const server = createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
			const candidates = [
				pathname === "/" ? "index.html" : pathname.slice(1),
				pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : `${pathname.slice(1)}.html`,
				pathname.endsWith("/") ? null : `${pathname.slice(1)}/index.html`,
			].filter(Boolean);
			let content;
			let file;
			for (const candidate of candidates) {
				try {
					file = join(root, candidate);
					content = await readFile(file);
					break;
				} catch {}
			}
			if (content === undefined || file === undefined) {
				response.writeHead(404);
				response.end("Not found");
				return;
			}
			response.writeHead(200, {
				"content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
			});
			response.end(content);
		} catch {
			response.writeHead(400);
			response.end("Bad request");
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("could not start proof server");
	return { server, url: `http://127.0.0.1:${address.port}` };
};

const htmlRoutes = async (root) => {
	const routes = [];
	const visit = async (directory) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else if (entry.name.endsWith(".html") && entry.name !== "404.html") {
				const pathname = relative(root, file).replaceAll("\\", "/");
				if (pathname === "index.html") routes.push("/");
				else if (pathname.endsWith("/index.html"))
					routes.push(`/${pathname.slice(0, -"index.html".length)}`);
				else routes.push(`/${pathname.slice(0, -".html".length)}`);
			}
		}
	};
	await visit(root);
	return [...new Set(routes)].toSorted();
};

const cssStats = async (root) => {
	let linked = 0;
	let inline = 0;
	const visit = async (directory) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else if (entry.name.endsWith(".css")) linked += (await readFile(file)).byteLength;
			else if (entry.name.endsWith(".html")) {
				const html = await readFile(file, "utf8");
				for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g))
					inline += Buffer.byteLength(match[1]);
			}
		}
	};
	await visit(root);
	return { linkedCssBytes: linked, inlineStyleBytes: inline, totalCssBytes: linked + inline };
};

const inspectHttp = async (url, routes) => {
	const statuses = {};
	const failures = [];
	for (const route of routes) {
		const response = await fetch(new URL(route, url));
		const html = await response.text();
		statuses[route] = response.status;
		if (!response.ok) failures.push({ route, reason: `HTTP ${response.status}` });
		if (/Application error|Unhandled Runtime Error/.test(html))
			failures.push({ route, reason: "SSR application error" });
	}
	return { statuses, failures };
};

const browserSnapshot = async (browser, url, route, options = {}) => {
	const context = await browser.newContext({
		javaScriptEnabled: options.javascriptEnabled ?? true,
		viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
	});
	const page = await context.newPage();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.addInitScript(() => {
		const style = document.createElement("style");
		style.textContent =
			"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;}";
		document.documentElement.append(style);
	});
	const origin = new URL(url).origin;
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error" && !/status of 404/.test(message.text()))
			errors.push(message.text());
	});
	await page.route("**/*", async (interceptedRoute) => {
		const request = interceptedRoute.request();
		if (request.resourceType() === "image" && new URL(request.url()).origin !== origin)
			await interceptedRoute.fulfill({ body: deterministicImage, contentType: "image/gif" });
		else await interceptedRoute.continue();
	});
	await page.goto(new URL(route, url).href, { waitUntil: "networkidle", timeout: 30_000 });
	await page.evaluate(() => {
		if (document.querySelector("style[data-pandwind-proof-freeze]")) return;
		const style = document.createElement("style");
		style.dataset.pandwindProofFreeze = "";
		style.textContent =
			"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;}";
		document.head.append(style);
	});
	await page.evaluate(() => document.fonts?.ready);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await new Promise((resolve) => setTimeout(resolve, 500));
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.evaluate(async () => {
		const settle = (image) =>
			Promise.race([
				image.decode().catch(() => undefined),
				new Promise((resolve) => setTimeout(resolve, 1_000)),
			]);
		await Promise.all([...document.images].map(settle));
	});
	await page.evaluate(() => document.fonts?.ready);
	await new Promise((resolve) => setTimeout(resolve, 100));
	const snapshot = await page.evaluate(() => {
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
			runtimeErrorText: [...document.querySelectorAll("body *")].filter((element) =>
				/Application error|Unhandled Runtime Error/.test(element.textContent ?? ""),
			).length,
		};
	});
	const screenshot =
		options.javascriptEnabled === false
			? null
			: await page.screenshot({ animations: "disabled", fullPage: true });
	await context.close();
	return {
		...snapshot,
		errors,
		screenshot,
		screenshotHash: screenshot ? createHash("sha256").update(screenshot).digest("hex") : null,
	};
};

const snapshotReport = ({ screenshot: _screenshot, ...snapshot }) => snapshot;

const compareScreenshots = async (page, baseline, candidate) =>
	page.evaluate(
		({ first, second, tolerance }) =>
			new Promise((resolve, reject) => {
				const decode = (value) =>
					new Promise((done, fail) => {
						const image = new Image();
						image.addEventListener("load", () => done(image), { once: true });
						image.addEventListener("error", fail, { once: true });
						image.src = `data:image/png;base64,${value}`;
					});
				Promise.all([decode(first), decode(second)])
					.then(([a, b]) => {
						if (a.width !== b.width || a.height !== b.height)
							return resolve({ changedPixels: a.width * a.height, ratio: 1, maxChannelDelta: 255 });
						const canvas = document.createElement("canvas");
						canvas.width = a.width;
						canvas.height = a.height;
						const context = canvas.getContext("2d", { willReadFrequently: true });
						if (!context) throw new Error("Canvas unavailable");
						context.drawImage(a, 0, 0);
						const firstPixels = context.getImageData(0, 0, a.width, a.height).data;
						context.clearRect(0, 0, canvas.width, canvas.height);
						context.drawImage(b, 0, 0);
						const secondPixels = context.getImageData(0, 0, b.width, b.height).data;
						let changedPixels = 0;
						let maxChannelDelta = 0;
						let minX = a.width;
						let minY = a.height;
						let maxX = -1;
						let maxY = -1;
						for (let index = 0; index < firstPixels.length; index += 4) {
							let significant = false;
							for (let channel = 0; channel < 3; channel += 1) {
								const delta = Math.abs(
									firstPixels[index + channel] - secondPixels[index + channel],
								);
								maxChannelDelta = Math.max(maxChannelDelta, delta);
								if (delta > tolerance) significant = true;
							}
							if (significant) {
								changedPixels += 1;
								const pixel = index / 4;
								const x = pixel % a.width;
								const y = Math.floor(pixel / a.width);
								minX = Math.min(minX, x);
								minY = Math.min(minY, y);
								maxX = Math.max(maxX, x);
								maxY = Math.max(maxY, y);
							}
						}
						resolve({
							changedPixels,
							ratio: changedPixels / (a.width * a.height),
							maxChannelDelta,
							bounds: changedPixels === 0 ? null : { minX, minY, maxX, maxY },
						});
					})
					.catch(reject);
			}),
		{
			first: baseline.toString("base64"),
			second: candidate.toString("base64"),
			tolerance: pixelTolerance,
		},
	);

const introducedErrors = (baseline, candidate) => {
	const remaining = new Map();
	for (const error of baseline) remaining.set(error, (remaining.get(error) ?? 0) + 1);
	return candidate.filter((error) => {
		const count = remaining.get(error) ?? 0;
		if (count === 0) return true;
		remaining.set(error, count - 1);
		return false;
	});
};

const baselineServer = await serve(baselineRoot);
const twServer = await serve(twRoot);
const cssServer = await serve(cssRoot);
const designServer = await serve(designRoot);
try {
	const routes = await htmlRoutes(baselineRoot);
	if (routes.length === 0) throw new Error(`no HTML routes found in ${baselineRoot}`);
	const servers = { baseline: baselineServer, tw: twServer, css: cssServer, design: designServer };
	const http = {};
	for (const [name, server] of Object.entries(servers))
		http[name] = await inspectHttp(server.url, routes);
	const css = {};
	for (const [name, root] of Object.entries({
		baseline: baselineRoot,
		tw: twRoot,
		css: cssRoot,
		design: designRoot,
	}))
		css[name] = await cssStats(root);
	const browser = await chromium.launch({
		headless: true,
		...(process.env.PW_BROWSER ||
		existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
			? {
					executablePath:
						process.env.PW_BROWSER ??
						"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
				}
			: {}),
	});
	const comparePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const visualRoutes = [
		"/",
		"/blog/",
		routes.find((route) => route.startsWith("/docs/v3/")),
		routes.find((route) => route.startsWith("/docs/v4/")),
		"/effect-days/",
		"/community-hub/",
	].filter(
		(route, index, selected) =>
			route !== undefined && routes.includes(route) && selected.indexOf(route) === index,
	);
	if (visualRoutes.length === 0) visualRoutes.push(...routes.slice(0, 3));
	const visual = {};
	for (const route of visualRoutes) {
		visual[route] = {};
		for (const viewport of [
			{ name: "desktop", width: 1440, height: 900 },
			{ name: "mobile", width: 390, height: 844 },
		]) {
			const snapshots = {};
			for (const [name, server] of Object.entries(servers))
				snapshots[name] = await browserSnapshot(browser, server.url, route, viewport);
			const screenshotDiffs = {};
			for (const name of ["tw", "css", "design"])
				screenshotDiffs[name] = await compareScreenshots(
					comparePage,
					snapshots.baseline.screenshot,
					snapshots[name].screenshot,
				);
			visual[route][viewport.name] = {
				baseline: snapshotReport(snapshots.baseline),
				lanes: Object.fromEntries(
					["tw", "css", "design"].map((name) => [
						name,
						{
							...snapshotReport(snapshots[name]),
							introducedBrowserErrors: introducedErrors(
								snapshots.baseline.errors,
								snapshots[name].errors,
							),
						},
					]),
				),
				screenshotDiffs,
			};
		}
	}
	const ssr = {};
	for (const route of visualRoutes) {
		const snapshots = {};
		for (const [name, server] of Object.entries(servers))
			snapshots[name] = await browserSnapshot(browser, server.url, route, {
				javascriptEnabled: false,
				width: 1440,
				height: 900,
			});
		ssr[route] = {
			baseline: snapshotReport(snapshots.baseline),
			lanes: Object.fromEntries(
				["tw", "css", "design"].map((name) => [name, snapshotReport(snapshots[name])]),
			),
		};
	}
	await browser.close();
	const report = {
		routeCount: routes.length,
		routes,
		visualRoutes,
		http,
		css,
		visual,
		ssr,
		pass: ["tw", "css", "design"].every(
			(name) =>
				http[name].failures.length === 0 &&
				css[name].totalCssBytes <= css.baseline.totalCssBytes &&
				Object.values(visual).every((route) =>
					Object.values(route).every(
						(viewport) =>
							viewport.screenshotDiffs[name].ratio <= 0.0005 &&
							viewport.lanes[name].introducedBrowserErrors.length === 0 &&
							viewport.lanes[name].runtimeErrorText === 0,
					),
				) &&
				Object.values(ssr).every(
					(route) =>
						route.lanes[name].runtimeErrorText === 0 &&
						route.lanes[name].title === route.baseline.title &&
						route.lanes[name].bodyHeight === route.baseline.bodyHeight,
				),
		),
	};
	if (reportPath)
		await (
			await import("node:fs/promises")
		).writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		JSON.stringify(
			{
				pass: report.pass,
				routeCount: report.routeCount,
				css: report.css,
				visualRoutes,
				reportPath,
			},
			null,
			2,
		),
	);
	if (!report.pass) process.exitCode = 1;
} finally {
	for (const { server } of [baselineServer, twServer, cssServer, designServer])
		await new Promise((resolve) => server.close(resolve));
}
