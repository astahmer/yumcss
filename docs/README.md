# YumCSS docs

The documentation site, built with Astro and Starlight.

```sh
pnpm --filter yumcss-docs dev     # http://localhost:4321
pnpm --filter yumcss-docs build   # also validates every internal link
```

| Variable                | Effect                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| `PUBLIC_PLAYGROUND_URL` | Where "Open in the playground" links point (default `http://localhost:5173`) |
| `SITE_URL`, `DOCS_BASE` | Deployed origin and sub-path                                                 |

## Writing pages

- Pages live in `src/content/docs/<section>/`, and the sidebar order is set in
  `astro.config.mjs`.
- Every code sample should type-check against the current packages. Check new
  snippets in a scratch module of an example app before you publish them.
  When a page shows output (class names, CSS, CLI reports), copy it from a
  real build or command run.
- Link to the playground with `<PlaygroundLink path="/basics" api="css" />`
  and frame app screenshots with `<Screenshot src={…} alt="…" />`.

## Screenshots

The tool screenshots in `src/assets/screenshots/` are captured with
Playwright. Start the apps, then pass their URLs:

```sh
pnpm playground -- --port 5310                    # repo root
pnpm --filter inspector exec vite --port 5320
nub scripts/run-migration-preview-e2e.mts          # http://127.0.0.1:5176/?token=migration-preview-test
node packages/analyze/dist/compiler-preview/cli.js "$PWD/examples/example" --no-open

PLAYGROUND_URL=http://localhost:5310 \
INSPECTOR_URL=http://localhost:5320 \
MIGRATION_PREVIEW_URL="http://127.0.0.1:5176/?token=migration-preview-test" \
COMPILER_PREVIEW_URL="<printed URL>" \
pnpm --filter yumcss-docs screenshots
```

Set `ONLY=playground-css,inspector-tokens` to recapture specific shots.
