# PostHog.com migration corpus

This corpus uses the read-only PostHog.com checkout pinned in
[`reference-repos.md`](../../reference-repos.md). The external Git checkout is
not edited or added as a JJ workspace. Pandwind versions the migration runner,
generated support files, and proof reports instead.

PostHog.com is a Gatsby 4 application using Tailwind 3.4. The first lane is a
static-first Tailwind migration:

- `tw` converts bridge-proven static utilities to typed `tw({...})` calls;
- custom colors, plugins, arbitrary selectors, dynamic `className` values, and
  other utilities without a proven mapping stay in the source class list as
  explicit residuals.

Run the corpus report with:

```sh
pnpm exec tsx scripts/migrate-posthog-docs.ts tw
```

Materialize a disposable Gatsby application with:

```sh
pnpm exec tsx scripts/migrate-posthog-docs.ts tw /tmp/pandwind-posthog-docs-tw
```

The materialized app copies the pinned source, injects the generated Pandwind
modules, adds the Pandwind dependency, and extends `safelist.txt` with the
static classes emitted by `tw()`. The source checkout remains untouched.

The acceptance contract is deliberately strict: the migration must build, the
same routes must respond successfully, browser console and request errors must
remain empty, screenshots and geometry must match at mobile and desktop
viewports, and generated CSS must not exceed the baseline. Residuals are
allowed only when they preserve the original utility verbatim and are listed
in the report; they are not silent losses.

The remaining `css.class` and `dcss` lanes will be added as separate JJ
revisions after the Tailwind lane has a passing Gatsby/browser proof. Each
lane is static first; runtime Pandwind is a fallback only for semantics that
cannot be represented by a static adapter.
