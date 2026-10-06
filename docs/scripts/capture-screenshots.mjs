// Captures the tool screenshots used by the docs into src/assets/screenshots.
// Start the apps first (see docs/README.md), then pass their URLs through env.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const outputDirectory = resolve(import.meta.dirname, "../src/assets/screenshots");
mkdirSync(outputDirectory, { recursive: true });

const urls = {
	playground: process.env.PLAYGROUND_URL,
	inspector: process.env.INSPECTOR_URL,
	migrationPreview: process.env.MIGRATION_PREVIEW_URL,
	compilerPreview: process.env.COMPILER_PREVIEW_URL,
};

const only = process.env.ONLY?.split(",");

const shots = [
	{ name: "playground-css", app: "playground", path: "/basics?api=css" },
	{ name: "playground-tw", app: "playground", path: "/basics?api=tw" },
	{ name: "playground-dss", app: "playground", path: "/design-preset?api=dss" },
	{ name: "playground-variants", app: "playground", path: "/variants", theme: "light" },
	{ name: "playground-responsive", app: "playground", path: "/responsive?api=css", theme: "light" },
	{
		name: "playground-tailwind-adapter",
		app: "playground",
		path: "/basics?api=css&adapter=tailwind",
	},
	{
		name: "playground-migrate",
		app: "playground",
		path: "/migrate",
		ready: async (page) => page.getByText("Residual report").first().waitFor(),
	},
	{ name: "inspector-tokens", app: "inspector", path: "/#tokens", wait: 6000 },
	{ name: "inspector-usage", app: "inspector", path: "/#tokens/usage", wait: 6000 },
	{ name: "inspector-relationships", app: "inspector", path: "/#tokens/relationships", wait: 6000 },
	{ name: "inspector-build", app: "inspector", path: "/#build", wait: 6000 },
	{
		name: "migration-preview",
		app: "migrationPreview",
		path: "",
		ready: async (page) => {
			await page.locator("#target option").nth(1).waitFor({ state: "attached" });
			await page.locator("#target").selectOption({ label: "css.class" });
			await page.locator("#evaluate").click();
			await page.waitForFunction(
				() => !document.querySelector("#output")?.textContent?.includes("No target output"),
			);
			await page
				.locator("details")
				.nth(2)
				.evaluate((element) => element.setAttribute("open", ""));
		},
	},
	{
		name: "compiler-preview",
		app: "compilerPreview",
		path: "",
		ready: async (page) => {
			await page.getByText("src/examples/typed-components-app.tsx").click();
			await page.getByText("Source → Vite output").waitFor();
		},
	},
];

const joinUrl = (base, path) => {
	if (path === "") return base;
	const url = new URL(base);
	const [pathname, search = ""] = path.split("?");
	const [cleanPath, hash = ""] = pathname.split("#");
	url.pathname = `${url.pathname.replace(/\/$/, "")}${cleanPath}`;
	if (search !== "") url.search = search;
	if (hash !== "") url.hash = hash;
	return url.toString();
};

const browser = await chromium.launch();

for (const shot of shots) {
	if (only !== undefined && !only.includes(shot.name)) continue;
	const base = urls[shot.app];
	if (base === undefined) {
		console.warn(`skip ${shot.name}: no URL for ${shot.app}`);
		continue;
	}
	const theme = shot.theme ?? "dark";
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1.5,
		colorScheme: theme,
	});
	await page.addInitScript((value) => {
		localStorage.setItem("yumcss-playground-theme", value);
		localStorage.setItem("theme", value);
	}, theme);
	await page.goto(joinUrl(base, shot.path), { waitUntil: "networkidle" });
	if (shot.app === "playground") {
		const toggle = page.getByRole("button", { name: theme, exact: true });
		if ((await toggle.count()) > 0) await toggle.first().click();
	}
	await shot.ready?.(page);
	await page.waitForTimeout(shot.wait ?? 2500);
	await page.screenshot({ path: resolve(outputDirectory, `${shot.name}.png`) });
	await page.close();
	console.log(`captured ${shot.name}`);
}

await browser.close();
