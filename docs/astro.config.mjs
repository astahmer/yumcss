import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const normalizeBase = (value) => {
	const path = value ?? "/";
	return `/${path}`.replace(/\/+/g, "/").replace(/([^/])$/, "$1/");
};

const base = normalizeBase(process.env.DOCS_BASE ?? process.env.ASTRO_BASE);
const site = process.env.SITE_URL;

export default defineConfig({
	base,
	site,
	integrations: [
		starlight({
			title: "pandwind",
			description:
				"Panda-like typed style objects that compile to real CSS — via Tailwind classes (tw()) or an atomic CSS-in-JS engine (css()).",
			favicon: "favicon.svg",
			social: [
				{
					icon: "github",
					label: "pandwind on GitHub",
					href: "https://github.com/astahmer/pandwind",
				},
			],
			editLink: {
				baseUrl: "https://github.com/astahmer/pandwind/edit/main/docs/",
			},
			customCss: ["./src/styles/custom.css"],
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			sidebar: [
				{
					label: "Start here",
					items: ["getting-started", "why-pandwind"],
				},
				{
					label: "Guides",
					items: [
						{ label: "Basic mode", items: ["guides/basic"] },
						{ label: "Advanced mode", items: ["guides/advanced"] },
						{ label: "Build a design system", items: ["guides/design-system"] },
						{ label: "Build a component library", items: ["guides/component-library"] },
						{ label: "Migrate from another library", items: ["guides/migrations"] },
					],
				},
				{
					// "Pick one lane": each entry point is a self-contained path.
					label: "Pick your lane",
					items: [
						{
							label: "Lane 1 — tw(): typed Tailwind classes",
							items: ["api/tw"],
						},
						{
							label: "Lane 2 — css(): atomic CSS-in-JS",
							items: ["api/css"],
						},
						{
							label: "Lane 3 — design css(): Figma vocabulary",
							items: ["api/design-css"],
						},
						{
							label: "Shared across lanes",
							items: ["api/cx", "api/theming"],
						},
					],
				},
				{
					label: "Build-time tooling",
					items: [
						"tooling/codegen",
						"tooling/vite-plugins",
						"tooling/multi-bundler",
						"tooling/codemod",
						"tooling/analyze-and-studio",
					],
				},
				{
					label: "Interop & proofs",
					items: [
						"interop/tailwind-adapter",
						"interop/css-in-js-adapters",
						"interop/compatibility",
					],
				},
				{
					label: "Reference",
					items: [
						"reference/implementation-status",
						"reference/adoption",
						"reference/adapter-contract",
						"reference/css-in-js-scorecard",
						"reference/authored-css",
						"reference/backends",
						"reference/ssr",
						"reference/size",
						"reference/benchmarks",
						"reference/limitations",
					],
				},
			],
		}),
	],
});
