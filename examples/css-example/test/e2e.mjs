// End-to-end: the css-example app on a real Chromium.
//
// Proves the CSS backend consumer path end to end: literal css()/design-css()
// calls in app source are extracted by pandwindCssVite into the atomic
// stylesheet, class hashes match at runtime, cx resolves conflicts
// (later wins), and identical literals dedup to one shared class.

// Sequential awaits are the point of an ordered e2e scenario.
// oxlint-disable eslint/no-await-in-loop
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 4610;
const PAGE_URL = `http://localhost:${PORT}/`;

let playwrightCore;
for (const base of [
	new URL("../node_modules/", import.meta.url),
	new URL("../../../", import.meta.url),
]) {
	try {
		playwrightCore = createRequire(base)("playwright-core");
		break;
	} catch {
		/* try next */
	}
}
if (!playwrightCore) throw new Error("playwright-core not resolvable");

let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
	if (!ok) failures++;
};

const server = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
	cwd: new URL("..", import.meta.url).pathname,
	stdio: ["ignore", "pipe", "pipe"],
});
const stopServer = () => {
	server.kill("SIGTERM");
};
process.on("exit", stopServer);

try {
	// Wait for dev server readiness.
	let up = false;
	for (let i = 0; i < 100 && !up; i++) {
		up = await fetch(PAGE_URL)
			.then((r) => r.ok)
			.catch(() => false);
		if (!up) await delay(150);
	}
	if (!up) throw new Error(`vite dev server did not come up on ${PAGE_URL}`);

	const browser = await playwrightCore.chromium.launch();
	const page = await browser.newPage();
	const consoleErrors = [];
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});
	page.on("pageerror", (e) => consoleErrors.push(String(e)));

	await page.goto(PAGE_URL, { waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="card-a"]');

	const computed = (testid, prop) =>
		page.$eval(
			`[data-testid="${testid}"]`,
			(el, p) => getComputedStyle(el).getPropertyValue(p),
			prop,
		);

	// Card A — design vocabulary over examplePreset tokens.
	check(
		"card-a background is $blue-500",
		(await computed("card-a", "background-color")) === "rgb(49, 130, 206)",
		await computed("card-a", "background-color"),
	);
	check("card-a radius lg -> 8px", (await computed("card-a", "border-radius")) === "8px");
	check("card-a pad[0] -> paddingTop 4px", (await computed("card-a", "padding-top")) === "4px");
	check("card-a pad[1] -> paddingLeft 8px", (await computed("card-a", "padding-left")) === "8px");

	// Card B — raw css() with a plain style object.
	check(
		"card-b raw color",
		(await computed("card-b", "color")) === "rgb(22, 163, 74)",
		await computed("card-b", "color"),
	);
	check("card-b padding 10px", (await computed("card-b", "padding")) === "10px");

	// Card C — cx conflict resolution: later fill wins, earlier dropped.
	const cBg = await computed("card-c", "background-color");
	const expectedC = await page.$eval('[data-testid="card-c"]', (el) => el.dataset.expected);
	check("card-c later fill wins", cBg === expectedC, `${cBg} vs expected ${expectedC}`);
	check("card-c differs from first fill", cBg !== "rgb(229, 62, 62)", `got ${cBg}`);

	// Cards A/D — identical literals resolve to one shared atomic class.
	const aClass = await page.$eval('[data-testid="card-a"]', (el) => el.className);
	const dClass = await page.$eval('[data-testid="card-d"]', (el) => el.className);
	check(
		"dedup: A and D share the same single class",
		aClass === dClass && aClass.trim().length > 0,
		`"${aClass}" vs "${dClass}"`,
	);

	check("zero console errors / pageerrors", consoleErrors.length === 0, consoleErrors.join(" | "));

	// CI visual-artifacts lane: optional deterministic capture.
	if (process.env.PW_SCREENSHOT !== undefined) {
		await page.screenshot({ path: process.env.PW_SCREENSHOT, fullPage: true });
	}
	await browser.close();
} catch (err) {
	failures++;
	console.log(`FAIL harness — ${err?.stack ?? err}`);
} finally {
	stopServer();
}

console.log(failures === 0 ? "SUMMARY: ALL PASS" : `SUMMARY: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
