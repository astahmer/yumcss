# PostHog.com migration corpus

This corpus uses the read-only PostHog.com checkout pinned in
[`reference-repos.md`](../../reference-repos.md). The external Git checkout is
not edited or added as a JJ workspace. Pandwind versions the migration runner,
generated support files, and proof reports instead.

PostHog.com is a Gatsby 4 application using Tailwind 3.4. The first lane is a
static-first Tailwind migration:

- `tw` converts bridge-proven static utilities to typed `tw({...})` calls;
- `css-class` converts bridge-complete static utility lists to `css.class(...)`
  through the Tailwind class strategy;
- `design-css` routes the same declarations through `createDesignCss` and its
  `$raw`-compatible façade;
- custom colors, plugins, arbitrary selectors, dynamic `className` values, and
  other utilities without a proven mapping stay in the source class list as
  explicit residuals.

Run the corpus report with:

```sh
pnpm exec tsx scripts/migrate-posthog-docs.ts tw
pnpm exec tsx scripts/migrate-posthog-docs.ts css-class
```

Materialize a disposable Gatsby application with:

```sh
pnpm exec tsx scripts/migrate-posthog-docs.ts tw /tmp/pandwind-posthog-docs-tw
```

Materialize the untouched baseline with the same pinned checkout:

```sh
pnpm exec tsx scripts/migrate-posthog-docs.ts baseline /tmp/pandwind-posthog-docs-baseline
```

After serving the baseline and each built lane, run the exhaustive proof:

```sh
pnpm exec tsx scripts/verify-posthog-docs.mjs \
  http://127.0.0.1:4351 \
  /tmp/pandwind-posthog-docs-baseline/public \
  http://127.0.0.1:4352 \
  http://127.0.0.1:4353 \
  http://127.0.0.1:4354 \
  examples/posthog-com-migration/reports/browser-parity.json
```

The verifier derives routes from the baseline's generated HTML instead of
using a hand-maintained allowlist. It checks every route's status, rendered
error markers, linked and inline CSS byte totals, then compares deterministic
SSR screenshots and hydrated landmark geometry at desktop (1440×900) and
mobile (390×844) for the representative routes that exist in that build. A
candidate fails if it adds CSS, changes a checked route, introduces a browser
error, changes hydrated geometry, or changes a meaningful screenshot pixel.
The browser fixture seeds random/UUID/time sources, warms lazy media, and
replaces remote images with a stable 1×1 fixture so external CDN responses do
not affect the comparison. Raw and significant pixel deltas are both retained
in the JSON report.

The materialized app copies the pinned source, injects the generated Pandwind
modules, adds the Pandwind dependency, and writes a generated token vocabulary
module so the compiler sees the original static utility candidates without
inflating the source stylesheet. The source checkout remains untouched.

The acceptance contract is deliberately strict: the migration must build, the
same routes must respond successfully, newly introduced browser errors must be
absent, SSR screenshots and hydrated geometry must match at mobile and desktop
viewports, and generated CSS must not exceed the baseline. Errors already
present in the pinned upstream baseline are reported but do not become false
migration failures. Residuals are allowed only when they preserve the original
utility verbatim and are listed in the report; they are not silent losses.

The `css.class` and `design-css` lanes are separate JJ revisions layered after
the `tw` lane. Each lane is static first; runtime Pandwind is a fallback only for semantics that
cannot be represented by a static adapter.

The external checkout is deliberately not versioned in JJ. Its exact Git
commit is pinned in `reference-repos.md`; the migration runner, support
modules, tests, and proof tooling are the versioned Pandwind artifact. This is
the same policy used for the other migration corpora.
