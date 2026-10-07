// Everything that determines what an Open Graph card looks like, shared by generate.mjs (renders)
// and check.mjs (verifies committed PNGs are current without launching a browser).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { sidebar } from "../sidebar.mjs";

const docsRoot = resolve(import.meta.dirname, "..");
const contentDirectory = join(docsRoot, "src/content/docs");

export const outputDirectory = join(docsRoot, "public/og");
export const manifestPath = join(import.meta.dirname, "manifest.json");

// Files whose bytes change how every card renders. Card data (title, section, …) is hashed per card.
const templateFiles = [
	join(import.meta.dirname, "cards.mjs"),
	join(docsRoot, "yums/brand/logo-mark.svg"),
	...["bricolage-grotesque", "inter", "jetbrains-mono"].map((family) =>
		fileURLToPath(
			import.meta.resolve(`@fontsource-variable/${family}/files/${family}-latin-wght-normal.woff2`),
		),
	),
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const templateHash = sha256(templateFiles.map((file) => sha256(readFileSync(file))).join(""));

const frontmatterValue = (source, key) =>
	source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();

/** The cards to render: one per docs page plus the two home variants. */
export const collectCards = () => {
	const site = new URL(process.env.SITE_URL ?? "https://yumcss-docs.astahmer.workers.dev").host;
	const sectionById = new Map(
		sidebar.flatMap((group) => group.items.map((id) => [id, group.label])),
	);
	const pages = readdirSync(contentDirectory, { recursive: true })
		.filter((file) => /\.mdx?$/.test(file))
		.map((file) => {
			const source = readFileSync(join(contentDirectory, file), "utf8");
			const id = file.replace(/\.mdx?$/, "").replace(/\\/g, "/");
			return {
				id,
				title: frontmatterValue(source, "title"),
				description: frontmatterValue(source, "description"),
			};
		})
		.filter((page) => page.id !== "index")
		.toSorted((a, b) => a.id.localeCompare(b.id));
	return [
		{ path: "home.png", kind: "home", data: { theme: "dark" } },
		{ path: "home-light.png", kind: "home", data: { theme: "light" } },
		...pages.map((page) => ({
			path: `docs/${page.id}.png`,
			kind: "doc",
			data: {
				title: page.title,
				description: page.description,
				section: sectionById.get(page.id),
				site,
			},
		})),
	];
};

/** Hash of everything a card's pixels depend on. */
export const cardInputHash = (card) =>
	sha256(templateHash + JSON.stringify({ kind: card.kind, data: card.data }));

export const fileHash = (path) => sha256(readFileSync(path));
