// Renders the Open Graph cards to docs/public/og/ (1200×630 PNG), records og/manifest.json for
// check.mjs, and writes og/preview.html for review.
// Usage: pnpm og   (set SITE_URL to match the deployed site)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { chromium } from "playwright-core";
import { docCard, homeCard } from "./cards.mjs";
import { cardInputHash, collectCards, fileHash, manifestPath, outputDirectory } from "./inputs.mjs";

const cards = collectCards();

const launch = async () => {
	try {
		return await chromium.launch();
	} catch {
		// Fall back to the locally installed Chrome when Playwright's own browser isn't downloaded.
		return await chromium.launch({ channel: "chrome" });
	}
};

rmSync(outputDirectory, { recursive: true, force: true });
const browser = await launch();
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 1,
});
const scratch = join(tmpdir(), "yumcss-og");
mkdirSync(scratch, { recursive: true });
const manifest = {};
for (const card of cards) {
	const html = card.kind === "home" ? homeCard(card.data) : docCard(card.data);
	const htmlPath = join(scratch, card.path.replaceAll("/", "__").replace(/\.png$/, ".html"));
	writeFileSync(htmlPath, html);
	await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	const output = join(outputDirectory, card.path);
	mkdirSync(dirname(output), { recursive: true });
	await page.screenshot({ path: output, type: "png" });
	manifest[card.path] = { input: cardInputHash(card), png: fileHash(output) };
}
await browser.close();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

const previewCards = cards.map((card) =>
	relative(import.meta.dirname, join(outputDirectory, card.path)),
);
const template = readFileSync(join(import.meta.dirname, "preview-template.html"), "utf8");
writeFileSync(
	join(import.meta.dirname, "preview.html"),
	template.replace("__CARDS__", JSON.stringify(previewCards)),
);
console.log(
	`rendered ${cards.length} cards to ${relative(join(import.meta.dirname, ".."), outputDirectory)}/`,
);
