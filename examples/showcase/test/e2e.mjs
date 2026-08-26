/**
 * Showcase browser e2e — the cross-target parity proof at app level.
 *
 * ONE shared vocabulary module (src/shared-styles.ts) rendered by TWO DOM
 * hosts simultaneously:
 *   - web:    atomic classes, computed styles from the extracted sheet
 *   - native: react-native-web processing real RN style objects
 *
 * Asserted equal, computed-style for computed-style:
 *   $blue-500 -> rgb(49, 130, 206), corners lg -> 8px radius,
 *   pad [4, 8] -> 4px top / 8px left. Plus the native-only `_dark` runtime
 *   toggle flipping status to rgb(17, 24, 39) ($gray-900).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

let chromium;
for (const base of [
	new URL("../node_modules/", import.meta.url),
	new URL("../../../../node_modules/", import.meta.url),
]) {
	try {
		chromium = createRequire(base)("playwright-core").chromium;
		break;
	} catch {
		/* try next */
	}
}
if (!chromium) throw new Error("playwright-core not resolvable");

// Sequential awaits are the point of an ordered e2e scenario.
// oxlint-disable eslint/no-await-in-loop
const PORT = 4670;
const BASE_URL = `http://localhost:${PORT}/`;
const TIMEOUT = 30_000;

const server = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
	cwd: new URL("..", import.meta.url).pathname,
	stdio: "ignore",
});

async function waitUp() {
	const deadline = Date.now() + TIMEOUT;
	let up = false;
	while (Date.now() < deadline && !up) {
		try {
			const res = await fetch(BASE_URL);
			up = res.ok;
		} catch {
			await new Promise((r) => setTimeout(r, 300));
		}
	}
	if (!up) throw new Error("vite dev server did not come up");
}

const failures = [];
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures.push(name);
};

try {
	await waitUp();
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	const consoleErrors = [];
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});
	page.on("pageerror", (e) => consoleErrors.push(String(e)));
	await page.goto(BASE_URL, { waitUntil: "networkidle" });

	const bg = async (tid) =>
		page.getByTestId(tid).evaluate((el) => getComputedStyle(el).backgroundColor);
	const pad = async (tid, side) =>
		page.getByTestId(tid).evaluate((el, s) => getComputedStyle(el)[`padding${s}`], side);
	const radius = async (tid) =>
		page.getByTestId(tid).evaluate((el) => getComputedStyle(el).borderRadius);

	// --- $blue-500 across targets --------------------------------------
	const BLUE = "rgb(49, 130, 206)";
	check("web header bg is $blue-500", (await bg("web-header")) === BLUE, await bg("web-header"));
	check(
		"native header bg is $blue-500",
		(await bg("native-header")) === BLUE,
		await bg("native-header"),
	);

	// --- corners lg -> 8px ----------------------------------------------
	check(
		"web header radius lg -> 8px",
		(await radius("web-header")) === "8px",
		await radius("web-header"),
	);
	const nRadius = await page
		.getByTestId("native-header")
		.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
	check("native header radius lg -> 8px", nRadius === "8px", nRadius);

	// --- pad [4, 8] per-side expansion ----------------------------------
	for (const [tid, prefix] of [
		["web-header", "web"],
		["native-header", "native"],
	]) {
		const top = await pad(tid, "Top");
		const left = await pad(tid, "Left");
		check(`${prefix} pad[0] -> paddingTop 4px`, top === "4px", top);
		check(`${prefix} pad[1] -> paddingLeft 8px`, left === "8px", left);
	}

	// --- native-only runtime _dark toggle -------------------------------
	await page.getByTestId("native-dark-toggle").getByText("toggle dark").click();
	await page.waitForTimeout(100);
	const darkBg = await bg("native-status");
	check("native status flips to $gray-900 in dark", darkBg === "rgb(17, 24, 39)", darkBg);
	await page.getByTestId("native-dark-toggle").getByText("toggle dark").click();
	await page.waitForTimeout(100);
	check(
		"native status restores light",
		(await bg("native-status")) === "rgb(243, 244, 246)",
		await bg("native-status"),
	);

	check("zero console/page errors", consoleErrors.length === 0, consoleErrors.join("; "));

	await browser.close();
} finally {
	server.kill("SIGTERM");
}

if (failures.length > 0) {
	console.log(`SUMMARY: FAIL — ${failures.length}: ${failures.join(", ")}`);
	process.exit(1);
}
console.log("SUMMARY: ALL PASS — web/native parity green");
