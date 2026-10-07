import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";

const site = process.env.SITE_URL ?? "https://yumcss-docs.astahmer.workers.dev";

export default defineConfig({
	base: "/",
	site,
	integrations: [
		starlight({
			plugins: [starlightLinksValidator()],
			title: "YumCSS",
			description:
				"Typed styles checked against your design system, compiled to plain class strings and atomic CSS at build time.",
			favicon: "favicon.svg",
			head: [
				{
					tag: "link",
					attrs: { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
				},
				{
					tag: "link",
					attrs: { rel: "icon", href: "/favicon-16.png", sizes: "16x16", type: "image/png" },
				},
				{ tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
			],
			components: { SiteTitle: "./src/components/SiteTitle.astro" },
			social: [
				{ icon: "github", label: "YumCSS on GitHub", href: "https://github.com/astahmer/yumcss" },
			],
			editLink: { baseUrl: "https://github.com/astahmer/yumcss/edit/main/docs/" },
			customCss: ["./src/styles/theme.css"],
			expressiveCode: {
				themes: ["github-dark-default", "github-light-default"],
				styleOverrides: {
					borderRadius: "12px",
					codeBackground: "var(--yum-code-bg)",
					borderColor: "var(--sl-color-hairline-light)",
					codeFontFamily: "var(--__sl-font-mono)",
					codeFontSize: "0.84rem",
					frames: {
						shadowColor: "transparent",
						editorActiveTabIndicatorTopColor: "var(--sl-color-accent)",
						terminalTitlebarBackground: "var(--yum-surface)",
						editorTabBarBackground: "var(--yum-surface)",
					},
				},
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			sidebar: [
				{
					label: "Start here",
					items: ["start/why", "start/quick-start"],
				},
				{
					label: "Styling with css()",
					items: [
						"css/overview",
						"css/conditions",
						"css/dynamic-styles",
						"css/composition",
						"css/escape-hatches",
						"css/extraction",
					],
				},
				{
					label: "Design systems",
					items: [
						"design-system/presets",
						"design-system/themes",
						"design-system/built-in-presets",
						"design-system/design-css",
						"design-system/design-tokens",
					],
				},
				{
					label: "Component libraries",
					items: ["components/component-library"],
				},
				{
					label: "Coming from Tailwind",
					items: [
						"tailwind/overview",
						"tailwind/tw",
						"tailwind/tailwind-classes",
						"tailwind/migrating-class-strings",
					],
				},
				{
					label: "Migrating",
					items: ["migrate/overview"],
				},
				{
					label: "Tools",
					items: [
						"tools/playground",
						"tools/inspector",
						"tools/analyzer",
						"tools/migration-preview",
						"tools/devtools",
						"tools/lint",
						"tools/mcp",
					],
				},
				{
					label: "Guides",
					items: ["guides/bundlers", "guides/ssr", "guides/platforms"],
				},
				{
					label: "Reference",
					items: [
						"reference/api",
						"reference/vite",
						"reference/class-name-strategies",
						"reference/cli",
					],
				},
				{
					label: "Project internals",
					collapsed: true,
					items: [
						"contributing/limitations",
						"contributing/size",
						"contributing/benchmarks",
						"contributing/api-matrix",
						"contributing/adapter-contract",
						"contributing/implementation-status",
						"contributing/architecture",
						"contributing/testing",
					],
				},
			],
		}),
	],
});
