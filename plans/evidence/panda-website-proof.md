# Installed Panda website proof

Date: 2026-09-09

This is a disposable host-project proof for the pinned Panda repository at
commit `8a71bff3dc805e247be70d120cf485c8f14f104b`. The reference checkout was
copied to a temporary directory, its installed website dependencies were
linked from the pinned reference, and the migration ran against that copy.
The pinned reference checkout was not modified.

## Migration

The copy was migrated with the normal codemod route:

```sh
nub --conditions pandwind packages/codemod/src/cli.ts migrate \
	--from panda --to pandwind-css \
	--root <temporary-copy>/website --no-install \
	--report --report-format=json \
	<temporary-copy>/website/<discovered source and config files>
```

The command completed successfully and emitted the Pandwind project support
files under `website/pandwind/` (`preset.ts`, `preset.mjs`, `css.ts`,
`vite-env.d.ts`, `runtime.ts`, `dss.ts`, and `cx.ts`). The generated
`__pandwind/` and Next output directories were also produced in the disposable
copy.

## Checks

| Check                              | Result                                         |
| ---------------------------------- | ---------------------------------------------- |
| `velite --clean`                   | passed                                         |
| website `tsc --noEmit`             | passed                                         |
| `next build`                       | passed; 202 static pages generated             |
| browser `GET /`                    | HTTP 200; page title and rendered body present |
| browser `GET /showcase`            | HTTP 200; page title and rendered body present |
| representative computed body color | `rgb(23, 23, 23)` on both checked routes       |

Two proof-only source compatibility edits were required in the copied host
project before its TypeScript/build checks: a missing `@pandacss/types`
dependency was replaced with the local structural type used by the component,
and the `defineTokens.colors({...})` call was changed to the equivalent
`defineTokens({...})` form accepted by the installed TypeScript/Panda typing.
These edits were made only in the disposable proof copy.

The browser spot-check surfaces an upstream external-link prefetch warning for
`https://pandamastery.com`; it does not prevent either checked local route from
rendering. The proof is representative host acceptance, not an exhaustive
browser run of every generated documentation route, and it does not claim
RSC/streaming or source-versus-target canonical CSS parity for the entire
website.
