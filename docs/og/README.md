# Open Graph cards

Frozen. Change the design only on an explicit request.

Every docs page gets a 1200×630 social card. `home.png` (dark) is the canonical homepage card;
`home-light.png` is kept as an alternative and is not referenced by any page.

| File           | Role                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cards.mjs`    | HTML/CSS templates for the home card and the docs-page card. Uses the canonical `logo-mark.svg` and the site fonts.        |
| `inputs.mjs`   | Which cards exist and what each depends on (title, description and sidebar section from frontmatter and `../sidebar.mjs`). |
| `generate.mjs` | Renders every card to `../public/og/` with a headless browser and records `manifest.json`.                                 |
| `check.mjs`    | Browser-free freshness check run in CI: fails when a card is missing, stale, orphaned or edited by hand.                   |
| `preview.html` | Generated review page: every card at full size and in X, LinkedIn, Slack and Discord embeds.                               |

`src/route-data.ts` adds `og:image` and `twitter:image` (absolute URLs, with alt text and size) to every page.

## After changing a page title, description, sidebar section or a template

```sh
pnpm -C docs og
```

Commit the regenerated PNGs and `manifest.json`. CI runs `pnpm -C docs og:check` and fails if they are out of date.
