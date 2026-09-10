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
				"Typed style objects that keep Tailwind and CSS familiar while moving known work to build time.",
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
					items: ["getting-started", "guides/basic", "why-pandwind"],
				},
				{
					label: "Build with pandwind",
					items: [
						"guides/design-system",
						"guides/component-library",
						"guides/migrations",
						"guides/advanced",
					],
				},
				{
					label: "Choose a styling API",
					items: [
						{
							label: "Tailwind objects — tw()",
							items: ["api/tw"],
						},
						{
							label: "Atomic CSS objects — css()",
							items: ["api/css"],
						},
						{
							label: "Design vocabulary — design css()",
							items: ["api/design-css"],
						},
						{
							label: "Shared tools — cx() and themes",
							items: ["api/cx", "api/theming"],
						},
					],
				},
				{
					label: "See and ship the result",
					items: [
						"tooling/analyze-and-studio",
						"tooling/codegen",
						"tooling/vite-plugins",
						"tooling/multi-bundler",
						"tooling/codemod",
					],
				},
				{
					label: "Integrations and proofs",
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
						"reference/technical-overview",
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
				{
					label: "Contributing",
					items: ["contributing/architecture", "contributing/testing"],
				},
			],
		}),
	],
});
