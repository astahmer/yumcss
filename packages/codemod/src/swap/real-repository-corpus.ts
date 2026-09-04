import { CodemodAdapterId } from "./identifiers.ts";

export interface RealRepositoryCorpus {
	readonly inline: readonly {
		readonly id: string;
		readonly repository: string;
		readonly commit: string;
		readonly path: string;
		readonly from: string;
		readonly to: string;
		readonly framework: string;
		readonly source: string;
	}[];
	readonly references: readonly RealRepositoryReference[];
}

/** One real, pinned source file per supported external source adapter. */
export interface RealRepositoryReference {
	readonly id: string;
	readonly repository: string;
	readonly clone: string;
	readonly commit: string;
	readonly path: string;
	readonly from: string;
	readonly to: CodemodAdapterId.Pandwind;
	readonly framework: "react" | "solid" | "vue" | "unknown";
}

/** Pinned source excerpts from real public repositories for deterministic proof. */
export function createRealRepositoryCorpus(): RealRepositoryCorpus {
	return {
		inline: [
			{
				id: "panda-website-home",
				repository: "https://github.com/chakra-ui/panda",
				commit: "8a71bff3dc805e247be70d120cf485c8f14f104b",
				path: "website/app/page.tsx",
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
				source: `import { Navbar } from '@/components/navbar'
import { css } from '@/styled-system/css'
import { CommunitySection } from '@/www/community.section'
import { CourseSection } from '@/www/course.section'
import { CssInJSSection } from '@/www/css-in-js.section'
import { DesignTokensSection } from '@/www/design-tokens.section'
import { FeatureMarqueeSection } from '@/www/feature-marquee.section'
import { FooterSection } from '@/www/footer.section'
import { HeroSection } from '@/www/hero.section'
import { ModernCssSection } from '@/www/modern-css.section'
import { RecipesSection } from '@/www/recipes.section'
import { StartBuildingSection } from '@/www/start-building.section'
import { TestimonialsSection } from '@/www/testimonials.section'
import { TryPandaSection } from '@/www/try-panda.section'
import { WorksEverywhereSection } from '@/www/works-everywhere.section'

export default function Page() {
  return (
    <>
      <Navbar />
      <div className={css({ display: 'flex', flexDirection: 'column' })}>
        <HeroSection />
        <FeatureMarqueeSection />
        <CssInJSSection />
        <CourseSection />
        <ModernCssSection />
        <DesignTokensSection />
        <RecipesSection />
        <TestimonialsSection />
        <TryPandaSection />
        <WorksEverywhereSection />
        <StartBuildingSection />
        <CommunitySection />
      </div>
      <FooterSection />
    </>
  )
}`,
			},
			{
				id: "emotion-benchmark-view",
				repository: "https://github.com/emotion-js/emotion",
				commit: "b882bcba85132554992e4bd49e94c95939bbf810",
				path: "packages/babel-plugin/__tests__/__fixtures__/core-with-css-import.js",
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.StyledComponents,
				framework: "react",
				source: `/** @jsx jsx */
import { jsx, css } from '@emotion/react'

const SomeComponent = props => (
  <div
    css={css\`
      color: hotpink;
    \`}
    {...props}
  />
)
`,
			},
			{
				id: "styled-components-benchmark-view",
				repository: "https://github.com/styled-components/styled-components",
				commit: "5f2a27ad31d4b17315a099c7f4ac8300c15f2cc2",
				path: "packages/benchmarks/src/implementations/styled-components-object/View.js",
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.Emotion,
				framework: "react",
				source: `import styled from 'styled-components';

export default styled.div({
  alignItems: 'stretch',
  borderStyle: 'solid',
  borderWidth: 0,
  boxSizing: 'border-box',
  display: 'flex',
  flexBasis: 'auto',
  flexDirection: 'column',
  flexShrink: 0,
  margin: 0,
  minHeight: 0,
  minWidth: 0,
  padding: 0,
  position: 'relative',
});
`,
			},
		] as const,

		references: [
			{
				id: "panda-website",
				repository: "https://github.com/chakra-ui/panda",
				clone: "panda",
				commit: "8a71bff3dc805e247be70d120cf485c8f14f104b",
				path: "website/app/page.tsx",
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "emotion-fixture",
				repository: "https://github.com/emotion-js/emotion",
				clone: "emotion",
				commit: "b882bcba85132554992e4bd49e94c95939bbf810",
				path: "packages/babel-plugin/__tests__/__fixtures__/core-with-css-import.js",
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "styled-components-benchmark",
				repository: "https://github.com/styled-components/styled-components",
				clone: "styled-components",
				commit: "5f2a27ad31d4b17315a099c7f4ac8300c15f2cc2",
				path: "packages/benchmarks/src/implementations/styled-components-object/View.js",
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "vanilla-extract-example",
				repository: "https://github.com/vanilla-extract-css/vanilla-extract",
				clone: "vanilla-extract",
				commit: "881c256a867f55386f96a7fe95068300bac720e6",
				path: "examples/next/components/HelloWorld.css.ts",
				from: CodemodAdapterId.VanillaExtract,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "stitches-react-test",
				repository: "https://github.com/stitchesjs/stitches",
				clone: "stitches",
				commit: "50fd8a1adc6360340fe348a8b3ebc8b06d38e230",
				path: "packages/core/tests/basic.js",
				from: CodemodAdapterId.Stitches,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "linaria-solid-example",
				repository: "https://github.com/callstack/linaria",
				clone: "linaria",
				commit: "41d201d45aa7c64aa0f2bd3148ec919c8e1f54eb",
				path: "examples/astro-solid/pages/csr.tsx",
				from: CodemodAdapterId.Linaria,
				to: CodemodAdapterId.Pandwind,
				framework: "solid",
			},
			{
				id: "jss-nested-benchmark",
				repository: "https://github.com/cssinjs/jss",
				clone: "jss",
				commit: "901882a894c7e802450696ebe2ea633ae63c5977",
				path: "examples/inline/app.js",
				from: CodemodAdapterId.Jss,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
			{
				id: "fela-render-test",
				repository: "https://github.com/rofrischmann/fela",
				clone: "fela",
				commit: "6883525fa44c2c47d0d93768eb26f072fee3c439",
				path: "packages/fela-dom/src/dom/__tests__/render-test.js",
				from: CodemodAdapterId.Fela,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
			{
				id: "goober-css-test",
				repository: "https://github.com/cristianbote/goober",
				clone: "goober",
				commit: "e7e6d33e210ed1f886fb4f372fc25ffd22d358d0",
				path: "src/__tests__/css.test.js",
				from: CodemodAdapterId.Goober,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
			{
				id: "aphrodite-api-test",
				repository: "https://github.com/Khan/aphrodite",
				clone: "aphrodite",
				commit: "225f43c5802259a9e042b384a1f4f2e5b48094ea",
				path: "tests/index_test.js",
				from: CodemodAdapterId.Aphrodite,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "style9-next-styles",
				repository: "https://github.com/johanholmerin/style9",
				clone: "style9",
				commit: "b0657ddb3cd24434a6a59db9c2e22cbedf5e6f42",
				path: "examples/nextjs/shared/styles.js",
				from: CodemodAdapterId.Style9,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "treat-button",
				repository: "https://github.com/seek-oss/treat",
				clone: "treat",
				commit: "1cc001170ee6b66b1d960ac4097fb84597163d1c",
				path: "examples/gatsby-plugin-treat-example/src/components/Button.treat.js",
				from: CodemodAdapterId.Treat,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "compiled-vite-example",
				repository: "https://github.com/atlassian-labs/compiled",
				clone: "compiled",
				commit: "0f5d2b606471b9fb92c2402d5367c3c23efd1a29",
				path: "fixtures/parcel-optimizer-test-app/src/index.jsx",
				from: CodemodAdapterId.Compiled,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "solid-styled-runtime",
				repository: "https://github.com/solidjs/solid-styled-components",
				clone: "solid-styled",
				commit: "b798a6d91a02450f3649365a3cdb27a282f4b37d",
				path: "test/test.spec.tsx",
				from: CodemodAdapterId.SolidStyled,
				to: CodemodAdapterId.Pandwind,
				framework: "solid",
			},
			{
				id: "vue-styled-css-test",
				repository: "https://github.com/vue-styled-components/core",
				clone: "vue-styled",
				commit: "5874630ed4d54aa955052fc864140eeae30fad2c",
				path: "packages/playground/src/App.vue",
				from: CodemodAdapterId.VueStyled,
				to: CodemodAdapterId.Pandwind,
				framework: "vue",
			},
			{
				id: "stylex-example",
				repository: "https://github.com/facebook/stylex",
				clone: "stylex",
				commit: "5f7acaa4b332e2cf8352e95e5bc83efd70904fd4",
				path: "examples/example-bun/src/App.jsx",
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "bamboo-benchmark-realistic-button",
				repository: "https://github.com/jantimon/css-in-js-bench",
				clone: "css-in-js-bench",
				commit: "3dee1bc32e651ace01c5e4d9306c541337d0c1ce",
				path: "techs/bamboo/case/realistic-button/index.tsx",
				from: CodemodAdapterId.Bamboo,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "next-yak-benchmark-realistic-button",
				repository: "https://github.com/jantimon/css-in-js-bench",
				clone: "css-in-js-bench",
				commit: "3dee1bc32e651ace01c5e4d9306c541337d0c1ce",
				path: "techs/next-yak/case/realistic-button/index.tsx",
				from: CodemodAdapterId.NextYak,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "next-yak-css-prop-benchmark-realistic-button",
				repository: "https://github.com/jantimon/css-in-js-bench",
				clone: "css-in-js-bench",
				commit: "3dee1bc32e651ace01c5e4d9306c541337d0c1ce",
				path: "techs/next-yak-css/case/realistic-button/index.tsx",
				from: CodemodAdapterId.NextYak,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "chakra-ui-box-sx",
				repository: "https://github.com/chakra-ui/chakra-ui",
				clone: "chakra-ui",
				commit: "7aca83e44de50f501d8274a55c331cb8fb06e4fa",
				path: "apps/www/components/chakra-mastery-ad.tsx",
				from: CodemodAdapterId.ChakraUi,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "mui-box-sx",
				repository: "https://github.com/mui/material-ui",
				clone: "mui",
				commit: "fc3a3a0a8b7c8f20274eca4758ea07a33e25c1b4",
				path: "docs/data/material/components/box/BoxSx.tsx",
				from: CodemodAdapterId.Mui,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "mantine-style-props",
				repository: "https://github.com/mantinedev/mantine",
				clone: "mantine",
				commit: "8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8",
				path: "apps/help.mantine.dev/src/components/MdxLayout/MdxLayout.tsx",
				from: CodemodAdapterId.Mantine,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "tokenami-nextjs-button",
				repository: "https://github.com/tokenami/tokenami",
				clone: "tokenami",
				commit: "29cf3b97ef14b22421734113f37b7b29e73f35e0",
				path: "examples/nextjs/src/components/button.tsx",
				from: CodemodAdapterId.Tokenami,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "unocss-nextjs-page",
				repository: "https://github.com/unocss/unocss",
				clone: "unocss",
				commit: "75103d5e12ec9876069daf6b97a7db1d73428829",
				path: "examples/next/app/page.tsx",
				from: CodemodAdapterId.UnoCSS,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "tailwindcss-docs-home",
				repository: "https://github.com/tailwindlabs/tailwindcss.com",
				clone: "tailwindcss.com",
				commit: "bd868a314bd05ca78acd047e3da289274dd6ccd7",
				path: "src/app/page.tsx",
				from: CodemodAdapterId.Tailwind,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "tamagui-remix-starter",
				repository: "https://github.com/tamagui/tamagui",
				clone: "tamagui",
				commit: "25d97e1ab6bc5d09e83c7776f61d6b0852048678",
				path: "code/starters/remix/app/routes/_index.tsx",
				from: CodemodAdapterId.Tamagui,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "astryx-not-found-module",
				repository: "https://github.com/facebook/astryx",
				clone: "astryx",
				commit: "8359f1a3601766e3a96ae0805e9487ac3dc17754",
				path: "apps/docsite/src/app/not-found.module.css",
				from: CodemodAdapterId.CssModules,
				to: CodemodAdapterId.Pandwind,
				framework: "react",
			},
			{
				id: "bootstrap-badge-scss",
				repository: "https://github.com/twbs/bootstrap",
				clone: "bootstrap",
				commit: "12cb8b902d175a0d612f1280f58b386a09921a16",
				path: "scss/helpers/_stacks.scss",
				from: CodemodAdapterId.Sass,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
			{
				id: "less-post-processor",
				repository: "https://github.com/less/less.js",
				clone: "less",
				commit: "713331655e437401dfea6cd233893a69762734e1",
				path: "packages/less/test/browser/less/postProcessor/postProcessor.less",
				from: CodemodAdapterId.Less,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
			{
				id: "posthog-global-authored-css",
				repository: "https://github.com/PostHog/posthog.com",
				clone: "posthog-com",
				commit: "8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff",
				path: "src/components/Layout/SkeletonLoading.css",
				from: CodemodAdapterId.AuthoredCss,
				to: CodemodAdapterId.Pandwind,
				framework: "unknown",
			},
		],
	};
}
