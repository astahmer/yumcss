# shadcn/ui v4 migration corpus

This corpus exercises the pinned `shadcn/ui` `apps/v4` application through
Pandwind's three supported authoring lanes. The upstream checkout is kept
outside this repository and is never edited. Pandwind versions the runner and
proof artifacts; the external Git commit is the source pin.

The runner scans authored `app`, `components`, `content`, and `lib` files,
loads the v4 Tailwind design system, and preserves unsupported Tailwind v4
syntax as explicit residuals. It does not treat generated registry output as
source input.

```sh
pnpm exec tsx scripts/migrate-shadcn-v4.ts tw
pnpm exec tsx scripts/migrate-shadcn-v4.ts css
pnpm exec tsx scripts/migrate-shadcn-v4.ts dcss
```

To create a disposable build target, pass an output path. The output is a
self-contained copy and must be installed in that directory; it references
the local Pandwind package through a file dependency.

```sh
pnpm exec tsx scripts/migrate-shadcn-v4.ts tw /tmp/pandwind-shadcn-v4-tw
cd /tmp/pandwind-shadcn-v4-tw
pnpm install --offline --no-frozen-lockfile
NEXT_PUBLIC_APP_URL=http://localhost:4001 pnpm --filter v4 exec next build
```

Each lane is intentionally independent:

- `tw` converts statically bridgeable utilities to typed Tailwind calls and
  keeps the remaining class tokens in the `cx` path.
- `css` emits the same normalized declarations through the runtime CSS API.
- `dcss` emits them through the design-language runtime and SSR insertion
  boundary.

The acceptance proof is a clean production build, complete route generation,
browser console/error checks, route geometry comparison, and stylesheet-size
comparison against a baseline built from the same pinned commit. A residual is
not a successful conversion of that token; it is a machine-readable statement
that the source construct still needs a richer lowering. The migration is only
lossless when the residual remains in the generated source and the browser
comparison passes.

The final proof for commit `683a5a9b370acdb7785a0529434e6a3b8c7e0441` covers
730 HTTP routes and 10 browser routes. All three lanes have equivalent route
statuses and pixel-identical screenshots. Aggregate unique external CSS is
2,751,794 bytes in the baseline and in every lane; the `tw` lane also has the
same 47,304 bytes of inline CSS. The `css` and `dcss` lanes intentionally add
runtime SSR style artifacts (205,517 and 206,069 aggregate inline bytes) to
implement their runtime APIs. Those lanes therefore prove external CSS and
browser semantics, not zero-cost runtime transport.

For the `tw` lane, generated Pandwind metadata is excluded from Tailwind's
automatic source scan. A generated source catalog preserves the original
authored candidates, so typed `tw()` object keys cannot accidentally become
extra Tailwind utilities. This is what makes the external CSS comparison
strict rather than merely visual.

The external repository does not need JJ versioning. Its Git SHA pins the
source; separate Pandwind JJ revisions record the harness and the `tw`, `css`,
and `dcss` proof results.
