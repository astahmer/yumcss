/** Pinned source excerpts from real public repositories for deterministic proof. */
export const REAL_REPOSITORY_CORPUS = [
	{
		id: "panda-website-home",
		repository: "https://github.com/chakra-ui/panda",
		commit: "8a71bff3dc805e247be70d120cf485c8f14f104b",
		path: "website/app/page.tsx",
		from: "panda",
		to: "pandwind",
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
		from: "emotion",
		to: "styled-components",
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
		from: "styled-components",
		to: "emotion",
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
] as const;
