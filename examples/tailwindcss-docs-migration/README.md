# Tailwind CSS docs migration corpus

This corpus is driven from the pinned `tailwindlabs/tailwindcss.com` checkout
recorded in [`reference-repos.md`](../../reference-repos.md). The upstream
checkout stays outside this repository and is never edited. Each migration
lane is materialized into a disposable app directory and is represented by a
separate JJ revision containing its proof report.

The runner uses the same generated Tailwind design system for every lane:

- `tw`: Tailwind utility classes become typed `tw({...})` calls; unsupported
  arbitrary/custom utilities remain literal through `cx()`.
- `css-class`: statically bridgeable classes become `css.class({...})` calls;
  unsupported classes remain literal so the result is lossless.
- `design-dss`: the same declarations become `$raw`-compatible design CSS
  calls through `dcss.class({...})`.

Run a lane against the pinned reference:

```sh
pnpm exec tsx scripts/migrate-tailwind-docs.ts tw
pnpm exec tsx scripts/migrate-tailwind-docs.ts css-class
pnpm exec tsx scripts/migrate-tailwind-docs.ts design-dss
```

Materialize a complete Next.js app for browser/build validation:

```sh
pnpm exec tsx scripts/migrate-tailwind-docs.ts tw /tmp/pandwind-tailwind-docs-tw
```

The output directory is intentionally disposable. Install its upstream
dependencies there, add the local Pandwind package, run `next build`, and
compare it with a baseline materialized from the same pinned commit. The
acceptance contract is: the app builds, route generation succeeds, browser
errors stay empty, route geometry stays equal, and unsupported source tokens
are preserved rather than silently dropped.

The upstream repository itself does not need to be JJ-versioned. Git already
pins the external source; Pandwind JJ revisions pin the migration runner,
generated metadata contract, and lane proof reports. The same policy applies
to the StyleX reference repository.
