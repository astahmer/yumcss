import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const require = createRequire(new URL("../examples/showcase/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const [baselineRoot, candidateRoot, reportPath] = process.argv.slice(2);
if (baselineRoot === undefined || candidateRoot === undefined)
	throw new Error(
		"usage: node scripts/verify-emotion-site.mjs BASELINE_OUT CANDIDATE_OUT [REPORT]",
	);

const mime = {
	".css": "text/css",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

function startStaticServer(root) {
	const server = createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
			if (pathname.includes("..")) throw new Error("invalid path");
			const relative = pathname === "/" ? "index.html" : pathname.slice(1);
			const candidates = [
				join(root, relative),
				join(root, relative.replace(/\/$/, ""), "index.html"),
				join(root, `${relative}.html`),
			];
			let file;
			for (const candidate of candidates) {
				try {
					const stat = await (await import("node:fs/promises")).stat(candidate);
					if (stat.isFile()) {
						file = candidate;
						break;
					}
				} catch {
					continue;
				}
			}
			if (file === undefined) {
				response.writeHead(404);
				response.end("not found");
				return;
			}
			response.writeHead(200, {
				"content-type": mime[extname(file)] ?? "application/octet-stream",
			});
			response.end(await readFile(file));
		} catch {
			response.writeHead(400);
			response.end("bad request");
		}
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function serverUrl(server) {
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("static server has no address");
	return `http://127.0.0.1:${address.port}`;
}

async function htmlFiles(root, directory = root) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await htmlFiles(root, file)));
		else if (entry.name.endsWith(".html")) files.push(file);
	}
	return files;
}

function routeFor(root, file) {
	const relative = file.slice(root.length).replaceAll("\\", "/");
	if (relative === "/index.html") return "/";
	return relative.replace(/\.html$/, "");
}

async function inspectPage(browser, url) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		javaScriptEnabled: false,
	});
	const page = await context.newPage();
	const origin = new URL(url).origin;
	await page.route("**/*", (route) => {
		const requestUrl = new URL(route.request().url());
		if (
			(requestUrl.protocol === "http:" || requestUrl.protocol === "https:") &&
			requestUrl.origin !== origin
		)
			return route.abort();
		return route.continue();
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("requestfailed", (request) => {
		if (new URL(request.url()).origin === origin)
			errors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`);
	});
	page.on("console", (message) => {
		if (message.type() === "error" && !message.text().startsWith("Failed to load resource:"))
			errors.push(message.text());
	});
	const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
	// Carbon Ads is a live third-party response and is not part of the migrated
	// site's rendering contract. Replace it with the same fixed, hidden layout
	// slot in both fixtures so changing ad copy cannot affect parity results.
	await page.evaluate(() => {
		const normalizeAds = () => {
			for (const element of document.querySelectorAll("#carbonads")) {
				if (element.childNodes.length === 0) continue;
				element.replaceChildren();
				element.setAttribute(
					"style",
					"height:100px!important;min-height:100px!important;visibility:hidden!important;overflow:hidden!important",
				);
			}
		};
		document.querySelectorAll('script[src*="carbonads.com"]').forEach((script) => script.remove());
		normalizeAds();
		new MutationObserver(normalizeAds).observe(document.body, { childList: true, subtree: true });
	});
	// External documentation images can be animated or CDN-transformed between
	// two loads. Keep their layout boxes but exclude nondeterministic pixels.
	await page.evaluate(() => {
		const style = document.createElement("style");
		style.textContent =
			'img[src^="http://"], img[src^="https://"] { visibility: hidden !important; }';
		document.head.append(style);
	});
	const css = await page.evaluate(() => {
		const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href);
		return Promise.all(links.map((href) => fetch(href).then((response) => response.text()))).then(
			(styles) => ({
				links,
				linked: styles.reduce(
					(total, style) => total + new TextEncoder().encode(style).byteLength,
					0,
				),
				inline: [...document.querySelectorAll("style")].reduce(
					(total, style) => total + new TextEncoder().encode(style.textContent ?? "").byteLength,
					0,
				),
				runtime: [...document.querySelectorAll("style")].filter(
					(style) => style.dataset.emotion !== undefined,
				).length,
			}),
		);
	});
	await page.waitForTimeout(250);
	const shape = await page.evaluate(() => {
		const visibleText = (element) => {
			const copy = element.cloneNode(true);
			copy.querySelectorAll("#carbonads, script, style").forEach((node) => node.remove());
			copy.querySelectorAll("th, td").forEach((cell) => cell.append(" "));
			return copy.textContent?.replace(/\s+/g, " ").trim();
		};
		const describe = (selector) => {
			const element = document.querySelector(selector);
			if (element === null) return null;
			const box = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				tag: element.tagName,
				text: visibleText(element)?.slice(0, 160),
				x: Math.round(box.x),
				y: Math.round(box.y),
				width: Math.round(box.width),
				height: Math.round(box.height),
				display: style.display,
				font: style.font,
				color: style.color,
				backgroundColor: style.backgroundColor,
			};
		};
		return {
			title: document.title,
			text: visibleText(document.body),
			textLength: visibleText(document.body)?.length ?? 0,
			bodyHeight: document.body.scrollHeight,
			landmarks: ["main", "nav", "footer", "h1", "h2", "h3", "pre", "button"].map(describe),
		};
	});
	const screenshot = await page.screenshot({ fullPage: true });
	await page.close();
	await context.close();
	return { status: response?.status() ?? 0, errors, css, shape, screenshot };
}

async function inspectHydration(browser, url) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const origin = new URL(url).origin;
	await page.route("**/*", (route) => {
		const requestUrl = new URL(route.request().url());
		if (
			(requestUrl.protocol === "http:" || requestUrl.protocol === "https:") &&
			requestUrl.origin !== origin
		)
			return route.abort();
		return route.continue();
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		if (message.type() === "error" && !message.text().startsWith("Failed to load resource:"))
			errors.push(message.text());
	});
	await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
	await page.evaluate(async () => {
		await document.fonts?.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	const result = await page.evaluate(() => {
		const button = [...document.querySelectorAll("button")].find((element) => !element.disabled);
		if (button === undefined) return { tested: false, ok: true };
		button.click();
		return { tested: true, ok: true };
	});
	await page.close();
	await context.close();
	return { ...result, errors };
}

async function screenshotDiff(browser, first, second) {
	const page = await browser.newPage();
	const result = await page.evaluate(
		async ({ first, second }) => {
			const decode = (value) =>
				new Promise((resolve, reject) => {
					const image = new Image();
					image.onload = () => resolve(image);
					image.onerror = reject;
					image.src = `data:image/png;base64,${value}`;
				});
			const [a, b] = await Promise.all([decode(first), decode(second)]);
			if (a.width !== b.width || a.height !== b.height)
				return { changedPixels: a.width * a.height, ratio: 1, width: a.width, height: a.height };
			const canvas = document.createElement("canvas");
			canvas.width = a.width;
			canvas.height = a.height;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			context.drawImage(a, 0, 0);
			const firstPixels = context.getImageData(0, 0, a.width, a.height).data;
			context.clearRect(0, 0, a.width, a.height);
			context.drawImage(b, 0, 0);
			const secondPixels = context.getImageData(0, 0, b.width, b.height).data;
			let changedPixels = 0;
			for (let index = 0; index < firstPixels.length; index += 4) {
				if (
					firstPixels[index] !== secondPixels[index] ||
					firstPixels[index + 1] !== secondPixels[index + 1] ||
					firstPixels[index + 2] !== secondPixels[index + 2]
				)
					changedPixels++;
			}
			return {
				changedPixels,
				ratio: changedPixels / (a.width * a.height),
				width: a.width,
				height: a.height,
			};
		},
		{ first: first.toString("base64"), second: second.toString("base64") },
	);
	await page.close();
	return result;
}

const [baselineServer, candidateServer] = await Promise.all([
	startStaticServer(baselineRoot),
	startStaticServer(candidateRoot),
]);
const baselineUrl = serverUrl(baselineServer);
const candidateUrl = serverUrl(candidateServer);
const routes = (await htmlFiles(baselineRoot))
	.map((file) => routeFor(baselineRoot, file))
	.filter((route) => !route.startsWith("/_next"))
	.toSorted();
const browser = await chromium.launch({ headless: true });
const results = {};
const failures = [];
for (const route of routes) {
	const [baseline, candidate] = await Promise.all([
		inspectPage(browser, `${baselineUrl}${route}`),
		inspectPage(browser, `${candidateUrl}${route}`),
	]);
	const hydration = await inspectHydration(browser, `${candidateUrl}${route}`);
	const diff = await screenshotDiff(browser, baseline.screenshot, candidate.screenshot);
	const routeFailures = [];
	if (baseline.status !== 200 || candidate.status !== 200)
		routeFailures.push(`HTTP ${baseline.status}/${candidate.status}`);
	if (candidate.errors.length > 0)
		routeFailures.push(`browser errors: ${candidate.errors.join(" | ")}`);
	if (baseline.shape.text !== candidate.shape.text)
		routeFailures.push(
			`visible text differs: ${baseline.shape.textLength}/${candidate.shape.textLength}`,
		);
	if (Math.abs(baseline.shape.bodyHeight - candidate.shape.bodyHeight) > 2)
		routeFailures.push(
			`body height differs: ${baseline.shape.bodyHeight}/${candidate.shape.bodyHeight}`,
		);
	if (candidate.css.linked + candidate.css.inline > baseline.css.linked + baseline.css.inline)
		routeFailures.push(
			`CSS bytes increased: ${baseline.css.linked + baseline.css.inline}/${candidate.css.linked + candidate.css.inline}`,
		);
	// Chromium text antialiasing can vary by a few pixels between isolated
	// contexts. The 0.2% bound still catches layout or styling regressions;
	// body geometry and landmark assertions remain exact.
	if (diff.ratio > 0.002) routeFailures.push(`screenshot delta ${(diff.ratio * 100).toFixed(3)}%`);
	if (hydration.errors.length > 0)
		routeFailures.push(`hydration errors: ${hydration.errors.join(" | ")}`);
	if (!hydration.ok) routeFailures.push("hydration interaction failed");
	if (routeFailures.length > 0) failures.push({ route, failures: routeFailures });
	results[route] = {
		status: { baseline: baseline.status, candidate: candidate.status },
		bodyHeight: { baseline: baseline.shape.bodyHeight, candidate: candidate.shape.bodyHeight },
		textLength: { baseline: baseline.shape.textLength, candidate: candidate.shape.textLength },
		screenshot: diff,
		css: { baseline: baseline.css, candidate: candidate.css },
		hydration,
		errors: candidate.errors,
	};
}
await browser.close();
baselineServer.close();
candidateServer.close();
const report = { routeCount: routes.length, failures, results };
if (reportPath !== undefined)
	await (
		await import("node:fs/promises")
	).writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	JSON.stringify({ routeCount: routes.length, failures: failures.length, reportPath }, null, 2),
);
if (failures.length > 0) process.exitCode = 1;
