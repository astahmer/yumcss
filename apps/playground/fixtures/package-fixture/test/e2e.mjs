import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../../../../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const fixtureRoot = resolve(import.meta.dirname, "..");
const clientOutput = resolve(process.env.YUMCSS_FIXTURE_OUT_DIR ?? ".proof-client");
const ssrOutput = resolve(process.env.YUMCSS_FIXTURE_SSR_OUT_DIR ?? ".proof-ssr");
const port = 4623;
const url = `http://127.0.0.1:${port}/`;
const timeout = 30_000;

const filesUnder = (directory) =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});

const serverBundle = filesUnder(ssrOutput).find(
	(path) => basename(path) === "entry-server.js" || basename(path) === "entry-server.mjs",
);
if (serverBundle === undefined) throw new Error("SSR build did not emit the fixture entry bundle");

const { render } = await import(pathToFileURL(serverBundle).href);
const indexPath = join(clientOutput, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");
const emptyRoot = '<div id="root"></div>';
if (!indexHtml.includes(emptyRoot)) throw new Error("client HTML has no empty fixture root");
writeFileSync(indexPath, indexHtml.replace(emptyRoot, `<div id="root">${render()}</div>`));

const server = spawn(
	"pnpm",
	[
		"exec",
		"vite",
		"preview",
		"--config",
		"vite.config.ts",
		"--host",
		"127.0.0.1",
		"--port",
		String(port),
		"--strictPort",
	],
	{ cwd: fixtureRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
const serverLogs = [];
server.stdout.on("data", (data) => serverLogs.push(data.toString()));
server.stderr.on("data", (data) => serverLogs.push(data.toString()));

let browser;
let page;
try {
	const deadline = Date.now() + timeout;
	let ready = false;
	while (!ready && Date.now() < deadline) {
		try {
			const response = await fetch(url);
			ready = response.ok;
		} catch {
			await new Promise((resolveWait) => setTimeout(resolveWait, 300));
		}
	}
	if (!ready) throw new Error(`fixture preview did not start:\n${serverLogs.join("")}`);

	browser = await chromium.launch();
	page = await browser.newPage();
	const browserErrors = [];
	page.on("console", (message) => {
		if (message.type() === "error") browserErrors.push(message.text());
	});
	page.on("pageerror", (error) => browserErrors.push(String(error)));

	await page.goto(url, { waitUntil: "networkidle" });
	const host = page.getByTestId("fixture-host");
	const control = page.getByTestId("hydration-control");
	if (!(await host.innerText()).includes("YumCSS package fixture")) {
		throw new Error("server-rendered fixture content is missing or unexpected");
	}
	if ((await control.innerText()) !== "Clicks: 0") {
		throw new Error("server-rendered hydration control has the wrong initial state");
	}
	if ((await host.evaluate((element) => getComputedStyle(element).paddingTop)) !== "16px") {
		throw new Error("built YumCSS CSS was not applied in Chromium");
	}
	await control.click();
	if ((await control.innerText()) !== "Clicks: 1") {
		throw new Error("the hydrated React click handler did not update the fixture");
	}
	if (browserErrors.length > 0) throw new Error(`browser errors: ${JSON.stringify(browserErrors)}`);
	console.log(
		"PASS Chromium rendered server markup, applied generated CSS, and hydrated the click handler",
	);
} finally {
	if (browser !== undefined) await browser.close();
	if (server.pid !== undefined) {
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {
			server.kill("SIGTERM");
		}
	}
}
