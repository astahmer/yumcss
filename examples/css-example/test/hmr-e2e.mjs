/**
 * Browser-level Vite HMR proof for the CSS extractor.
 *
 * The test changes a token transitively imported by a composed createDesignCss
 * factory while a real Vite dev server and Chromium page are running. It
 * verifies both the new computed style and that the page was not reloaded, so
 * this covers the browser-facing HMR loop rather than only calling the
 * plugin's invalidation hook.
 */
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "@pandwind/example-preset";
import { createDesignCss } from "pandwind/design";
import { pandwindCssVite } from "pandwind/vite";

const root = realpathSync(mkdtempSync(join(tmpdir(), "pandwind-vite-hmr-")));
const entry = join(root, "src/app.tsx");
const browserRoot = new URL("../node_modules/", import.meta.url);
const requireFromExample = createRequire(browserRoot);
const chromium = requireFromExample("playwright-core").chromium;
const pandwindPackageRoot = new URL("../../../packages/pandwind/", import.meta.url).pathname;
const examplePresetRoot = new URL("../../../examples/pandwind-example-preset/", import.meta.url)
	.pathname;
const reactRoot = dirname(requireFromExample.resolve("react"));
const reactDomRoot = dirname(requireFromExample.resolve("react-dom"));
const hmrPreset = {
	...examplePreset,
	tokens: {
		...examplePreset.tokens,
		colors: { ...examplePreset.tokens.colors, "$blue-500": "#3182CE" },
	},
};

const writeApp = () => {
	writeFileSync(
		entry,
		[
			'import { css } from "./css";',
			'export function App() { return <div data-testid="target" className={css.class({ $text: { color: "$blue-500" } })}>HMR</div>; }',
		].join("\n"),
	);
};

const writeThemeToken = (color) => {
	writeFileSync(join(root, "src/theme-token.ts"), `export const blue500 = "${color}";`);
};

const writeFixture = (color) => {
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
	);
	writeFileSync(
		join(root, "src/css.ts"),
		[
			'import { createDesignCss } from "pandwind/design";',
			'import { examplePreset } from "@pandwind/example-preset";',
			'import { blue500 } from "./theme-token";',
			'const preset = { ...examplePreset, tokens: { ...examplePreset.tokens, colors: { ...examplePreset.tokens.colors, "$blue-500": blue500 } } };',
			"export const css = createDesignCss(preset);",
		].join("\n"),
	);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import { createRoot } from "react-dom/client";',
			'import { App } from "./app";',
			'import "pandwind:css";',
			'createRoot(document.getElementById("root")).render(<App />);',
		].join("\n"),
	);
	writeThemeToken(color);
	writeApp();
};

const waitForServerUrl = async (server) => {
	const deadline = Date.now() + 10_000;
	const poll = async () => {
		const url = server.resolvedUrls?.local?.[0];
		if (url) return url;
		if (Date.now() >= deadline) throw new Error("Vite did not expose a local URL");
		await new Promise((resolve) => setTimeout(resolve, 25));
		return poll();
	};
	return poll();
};

let server;
let browser;
try {
	mkdirSync(join(root, "node_modules"), { recursive: true });
	symlinkSync(pandwindPackageRoot, join(root, "node_modules/pandwind"), "dir");
	mkdirSync(join(root, "node_modules/@pandwind"), { recursive: true });
	symlinkSync(examplePresetRoot, join(root, "node_modules/@pandwind/example-preset"), "dir");
	writeFixture("#3182CE");
	const css = createDesignCss(hmrPreset);
	server = await createServer({
		root,
		plugins: [pandwindCssVite(css, { root }), react()],
		resolve: {
			alias: [
				{ find: "react-dom", replacement: reactDomRoot },
				{ find: "react", replacement: reactRoot },
			],
		},
		server: {
			host: "127.0.0.1",
			port: 0,
			strictPort: false,
			fs: { allow: [root, pandwindPackageRoot, examplePresetRoot, reactRoot, reactDomRoot] },
		},
	});
	await server.listen();
	const url = await waitForServerUrl(server);

	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	let navigations = 0;
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(String(error)));
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) navigations++;
	});

	await page.goto(url, { waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="target"]');
	const color = () =>
		page.$eval('[data-testid="target"]', (element) => getComputedStyle(element).color);
	assert.equal(await color(), "rgb(49, 130, 206)");
	assert.equal(navigations, 1);

	writeThemeToken("#E53E3E");
	const changedAt = new Date(Date.now() + 1_000);
	utimesSync(join(root, "src/theme-token.ts"), changedAt, changedAt);
	await new Promise((resolve) => setTimeout(resolve, 250));
	await page.waitForFunction(
		() =>
			getComputedStyle(document.querySelector('[data-testid="target"]')).color ===
			"rgb(229, 62, 62)",
		undefined,
		{ timeout: 10_000 },
	);

	assert.equal(await color(), "rgb(229, 62, 62)");
	assert.equal(navigations, 1, "Vite HMR should update the page without a full reload");
	assert.deepEqual(errors, []);
	console.log("SUMMARY: ALL PASS — browser Vite HMR updated extracted CSS without reload");
} finally {
	if (browser) await browser.close();
	if (server) await server.close();
	rmSync(root, { recursive: true, force: true });
}
