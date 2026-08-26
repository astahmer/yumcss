/**
 * rn-example e2e — pandwind/react-native styles rendered by a REAL
 * react-native-web host in real Chromium.
 *
 * What is proven end-to-end:
 * 1. token resolution survives the whole pipeline: $blue-500 -> rgb(49,130,206)
 * 2. RN shorthand expansion: pad [4,8] -> per-side paddingTop/Right/Bottom/Left
 * 3. radius token lg (0.5rem) -> unitless dp 8 -> borderTopLeftRadius 8px
 * 4. runtime condition resolution: _dark flips the body fill on toggle
 * 5. cx merge semantics: conflicting backgroundColors resolve later-wins
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

let chromium;
for (const base of [
	new URL("../node_modules/", import.meta.url),
	new URL("../../../", import.meta.url),
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

const PORT = 4611;
const BASE_URL = `http://localhost:${PORT}/`;
const TIMEOUT = 30_000;

const failures = [];
const check = (name, actual, expected) => {
	const ok = Object.entries(expected).every(([prop, want]) => actual[prop] === want);
	if (ok) {
		console.log(`PASS ${name}`);
	} else {
		const got = Object.fromEntries(Object.keys(expected).map((p) => [p, actual[p]]));
		failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
		console.log(`FAIL ${name}: ${JSON.stringify(got)} != ${JSON.stringify(expected)}`);
	}
};

const server = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
	cwd: new URL("..", import.meta.url).pathname,
	stdio: ["ignore", "pipe", "pipe"],
});
const serverLogs = [];
server.stdout.on("data", (d) => serverLogs.push(d.toString()));
server.stderr.on("data", (d) => serverLogs.push(d.toString()));

let browser;
try {
	// wait for the dev server
	const deadline = Date.now() + TIMEOUT;
	// Sequential by design: poll the dev server until it answers.
	let up = false;
	while (Date.now() < deadline && !up) {
		try {
			const res = await fetch(BASE_URL);
			up = res.ok;
		} catch {
			await new Promise((r) => setTimeout(r, 300));
		}
	}
	if (!up) throw new Error(`dev server did not come up:\n${serverLogs.join("")}`);

	browser = await chromium.launch();
	const page = await browser.newPage();
	const consoleErrors = [];
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});
	page.on("pageerror", (e) => consoleErrors.push(String(e)));

	await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="header-card"]', { timeout: TIMEOUT });

	const styleOf = async (testId) =>
		page.$eval(`[data-testid="${testId}"]`, (el) => {
			const s = getComputedStyle(el);
			return {
				backgroundColor: s.backgroundColor,
				borderTopLeftRadius: s.borderTopLeftRadius,
				paddingTop: s.paddingTop,
				paddingRight: s.paddingRight,
				paddingBottom: s.paddingBottom,
				paddingLeft: s.paddingLeft,
			};
		});

	// 1+2+3: tokens + RN shorthand expansion through a real RN host
	check(
		"header card: $blue-500 fill, lg corners, pad [4,8] expanded per-side",
		await styleOf("header-card"),
		{
			backgroundColor: "rgb(49, 130, 206)",
			borderTopLeftRadius: "8px",
			paddingTop: "4px",
			paddingRight: "8px",
			paddingBottom: "4px",
			paddingLeft: "8px",
		},
	);

	// 4: runtime _dark resolution, both directions
	check("body card starts light ($gray-100)", await styleOf("body-card"), {
		backgroundColor: "rgb(243, 244, 246)",
	});
	await page.click('[data-testid="dark-toggle"]');
	await page.waitForFunction(
		() => {
			const el = document.querySelector('[data-testid="body-card"]');
			return el !== null && getComputedStyle(el).backgroundColor === "rgb(17, 24, 39)";
		},
		{ timeout: TIMEOUT },
	);
	check("body card goes dark after toggle ($gray-900)", await styleOf("body-card"), {
		backgroundColor: "rgb(17, 24, 39)",
	});
	await page.click('[data-testid="dark-toggle"]');
	await page.waitForFunction(
		() => {
			const el = document.querySelector('[data-testid="body-card"]');
			return el !== null && getComputedStyle(el).backgroundColor === "rgb(243, 244, 246)";
		},
		{ timeout: TIMEOUT },
	);
	check("body card restores light after second toggle", await styleOf("body-card"), {
		backgroundColor: "rgb(243, 244, 246)",
	});

	// 5: cx merge later-wins
	check("merged card: later backgroundColor wins ($blue-500)", await styleOf("merged-card"), {
		backgroundColor: "rgb(49, 130, 206)",
	});

	if (consoleErrors.length > 0) {
		failures.push(`console/page errors: ${JSON.stringify(consoleErrors)}`);
	} else {
		console.log("PASS zero console/page errors");
	}
} catch (error) {
	failures.push(String(error));
} finally {
	if (browser) await browser.close();
	server.kill("SIGTERM");
}

if (failures.length > 0) {
	console.log(`\nSUMMARY: FAIL (${failures.length})`);
	for (const f of failures) console.log(`  - ${f}`);
	process.exit(1);
}
console.log("\nSUMMARY: PASS — rn-example e2e green");
