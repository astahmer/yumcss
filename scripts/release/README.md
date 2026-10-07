# npm release runbook

This repository publishes five packages: `yumcss`, `@yumcss/codemod`,
`@yumcss/analyze`, `@yumcss/devtools`, and `@yumcss/lint-plugin`. Publishing is
triggered by a `v*` tag after the package versions and changelogs are prepared
through Changesets.

## Package names

The core package is `yumcss` (unscoped). Tooling packages use the `@yumcss/*`
scope. The npm user that publishes the release owns `yumcss`; the `@yumcss`
organization controls scoped tool packages. Keep these exact identities in
manifests, workspace dependencies, generated code, docs, and examples. Check
`yumcss` availability while authenticated as the publishing npm user, then
check again immediately before first release.

## Prepare npm access

Confirm that the publishing npm user owns `yumcss`, and that it has write access
to the `@yumcss` organization packages. The initial publish of each scoped
tool must be public; the package manifests and release script already request
public access.

The GitHub Actions workflow reads the repository's `NPM_TOKEN` secret and also
grants OIDC permission for provenance. The secret is configured. Confirm its
npm token is granular, can publish `yumcss` and `@yumcss/*`, and satisfies npm's
2FA policy. Never put the token in a manifest, source file, or command history.
Trusted publishing is a later alternative; switching to it requires changing
the workflow authentication setup.

References: [npm package scope access and ownership](https://docs.npmjs.com/package-scope-access-level-and-visibility/),
[publishing an organization-scoped public package](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/),
and [npm publishing 2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

## Prepare a release

1. Make the source change and add a Changeset for every package whose published
   behavior or API changed:

   ```sh
   pnpm exec changeset
   ```

2. Run the release preflight and the relevant package checks. The full CI gate
   should pass on the commit that will be released:

   ```sh
   pnpm run release:check
   pnpm run check
   pnpm run release:smoke
   ```

   `release:smoke` packs each package, verifies every exported target, imports
   the published JavaScript entrypoints by package specifier, and tests the
   core tarball from a clean npm consumer. The core consumer exercises
   `css.class()` at runtime and typechecks its imports against the declarations
   inside the tarball. `prepack` runs each package build before packing, so the
   archive is produced from the current source.

3. Merge the Changesets PR created by the `changesets` job on `main`. Review the
   resulting package versions, workspace dependency ranges, and changelog
   entries before merging it.

4. After the version commit is on `main` and CI is green, create and push the
   matching `vX.Y.Z` tag. The release workflow runs typecheck and tests again,
   runs pack smoke checks, publishes in dependency order, and creates the
   GitHub release. Do not tag until the package name, tarball, README, and
   access configuration are final; correcting a published identity requires a
   separate package and an import migration.

## Verify the published package

Use a new directory outside the repository so workspace links cannot hide a
missing file or dependency:

```sh
npm view yumcss version dist-tags --json
mkdir yumcss-npm-consumer
cd yumcss-npm-consumer
npm init -y
npm install yumcss@X.Y.Z
```

Then run a small ESM import using the chosen package name:

```sh
node --input-type=module -e '
import { createCss } from "yumcss/css";
import { defaultPreset } from "yumcss/preset/default";
const css = createCss(defaultPreset);
console.log(css.class({ backgroundColor: "white", color: "black", padding: 4, borderRadius: "lg" }));
'
```

Also install and exercise each separately published `@yumcss/*` tool package
that the release changes.

## Current readiness

- The five publishable manifests carry versions, licenses, repository
  metadata, file allowlists, public access settings, and provenance settings.
  Their minimum Node version is 22, matching the release runtime and supported
  LTS lines.
- Every package builds through `prepack`. `pnpm run release:smoke` passes for
  all five: each tarball resolves every public export by package specifier,
  imports every shipped library module, and the core tarball is installed in a
  clean npm consumer that exercises `css.class()` at runtime and typechecks its
  imports against the shipped declarations. `@yumcss/analyze` additionally
  installs in a clean consumer, loads the default governance preset, and runs
  its CLI.
- Core identity is fixed as `yumcss`; tools remain under `@yumcss/*`.
- All five names are currently unpublished on npm and available.
- The workflow expects `NPM_TOKEN`, which is configured in GitHub Actions.
  Confirm the token grants publish access to the unscoped core package and the
  scoped tools before tagging.
- The repository is `astahmer/yumcss` and is currently **private**. npm rejects
  a `--provenance` publish whose source repository is not public (it validates
  the "Source Repository Visibility At Signing" certificate extension against
  public values), so make the repository public before tagging, or drop
  `--provenance`/`publishConfig.provenance` until it is. A private repo also
  makes previously published provenance unverifiable.
