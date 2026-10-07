// Fails when the committed Open Graph PNGs no longer match their inputs (page titles, descriptions,
// sidebar sections, card templates, fonts, logo). Hash-only: no browser needed.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cardInputHash, collectCards, fileHash, manifestPath, outputDirectory } from "./inputs.mjs";

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const cards = collectCards();
const expected = new Set(cards.map((card) => card.path));
const problems = [];

for (const card of cards) {
	const recorded = manifest[card.path];
	const png = join(outputDirectory, card.path);
	if (recorded === undefined || !existsSync(png)) problems.push(`missing: ${card.path}`);
	else if (recorded.input !== cardInputHash(card)) problems.push(`stale: ${card.path}`);
	else if (recorded.png !== fileHash(png))
		problems.push(`edited outside the generator: ${card.path}`);
}

const committed = readdirSync(outputDirectory, { recursive: true }).filter((file) =>
	file.endsWith(".png"),
);
for (const file of committed) {
	if (!expected.has(file.replace(/\\/g, "/"))) problems.push(`orphaned: ${file}`);
}

if (problems.length > 0) {
	console.error(
		`Open Graph cards are out of date (${problems.length}):\n  ${problems.join("\n  ")}`,
	);
	console.error("Regenerate them with: pnpm -C docs og");
	process.exit(1);
}
console.log(`Open Graph cards are current (${cards.length}).`);
