# pandwind

Typed styling for teams that want the confidence of TypeScript without giving
up the CSS tools they already use.

Pandwind checks style objects against a project's real design system and moves
known styles to ordinary CSS classes or an extracted atomic stylesheet. CSS
remains CSS, Tailwind remains Tailwind, and runtime values keep an explicit
escape hatch.

## Start here

| Your task                             | Guide                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Write typed CSS objects               | [Getting started](./docs/src/content/docs/getting-started.md)          |
| Build shared tokens and themes        | [Design-system guide](./docs/src/content/docs/guides/design-system.md) |
| Keep Tailwind and add typed utilities | [Tailwind guide](./docs/src/content/docs/api/tw.md)                    |
| Combine styles from different sources | [Composition guide](./docs/src/content/docs/api/cx.md)                 |
| Evaluate a migration                  | [Migration guide](./docs/src/content/docs/guides/migrations.md)        |

The getting-started guide is the canonical setup and example source. It assumes
an existing Vite app; use the [multi-bundler guide](./docs/src/content/docs/tooling/multi-bundler.md)
for other bundlers. The [preset reference](./docs/src/content/docs/api/presets.md)
lists the core and optional ecosystem presets.

## See it in action

The repository includes a Playground, Inspector, Analyzer, and read-only
Migration Preview. These tools help explore and verify Pandwind; they are
optional workflows, not required setup.

<table>
  <tr>
    <td width="50%">
      <img src="docs/assets/showcase/playground-variants-dark.png" alt="Pandwind playground showing typed variants and a live preview" />
    </td>
    <td width="50%">
      <img src="docs/assets/showcase/playground-tokens-light.png" alt="Pandwind playground showing raw, semantic, and component tokens" />
    </td>
  </tr>
  <tr>
    <td><strong>Playground</strong><br />Change a typed example and inspect the rendered result.</td>
    <td><strong>Token layers</strong><br />See token references resolve in a real preview.</td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/assets/showcase/inspector-design-system.png" alt="Pandwind inspector showing typed unions and token swatches" />
    </td>
    <td width="50%">
      <img src="docs/assets/showcase/analyzer-coverage.png" alt="Pandwind analyzer showing extraction coverage, CSS budget, and missing CSS warnings" />
    </td>
  </tr>
  <tr>
    <td><strong>Inspector</strong><br />Browse tokens, utilities, and generated mappings.</td>
    <td><strong>Analyzer</strong><br />Measure extraction, stylesheet shape, CSS size, and missing CSS.</td>
  </tr>
</table>

Migration Preview opens a project in a read-only workspace so you can inspect
generated code, residuals, and evidence before editing files.

## How the styling lanes fit

- **Typed CSS objects:** the primary path for new code. Pandwind extracts
  static styles and keeps runtime values explicit.
- **Tailwind utilities:** generated types and build-time folding for projects
  that keep Tailwind as their stylesheet engine.
- **Design vocabulary:** named terms for components that should express intent
  instead of individual CSS properties.
- **Class composition:** combine Pandwind output with ordinary classes and
  styles from other libraries.
- **Migration tools:** preview registered source-to-target routes and preserve
  unsupported behavior as typed residuals.

The [CSS API](./docs/src/content/docs/api/css.md), [design API](./docs/src/content/docs/api/design-css.md),
[Tailwind API](./docs/src/content/docs/api/tw.md), and [composition API](./docs/src/content/docs/api/cx.md)
show each lane in detail.

Pandwind is static-first, not universal compilation. Dynamic values use
explicit runtime carriers or Tailwind safelists. Globals, complex selectors,
and framework-owned behavior stay with authored CSS or the host integration
when Pandwind cannot prove a safe representation. See
[current limitations](./docs/src/content/docs/reference/current-limitations-and-criticism.md).

## Repository tools

Run these from the repository checkout:

```sh
pnpm run playground
pnpm run inspect
pnpm run analyze
pnpm run migration-preview
```

The [tooling guide](./docs/src/content/docs/tooling/workflows.md) explains what
each tool checks.

## Documentation

- [Getting started](./docs/src/content/docs/getting-started.md)
- [API references](./docs/src/content/docs/api/)
- [Guides](./docs/src/content/docs/guides/)
- [Migration adapters](./docs/src/content/docs/interop/css-in-js-adapters.md)
- [Tooling](./docs/src/content/docs/tooling/)
- [Implementation status](./docs/src/content/docs/reference/implementation-status.md)
- [Current limitations](./docs/src/content/docs/reference/current-limitations-and-criticism.md)

## Work on Pandwind

```sh
pnpm install --frozen-lockfile
pnpm run test
pnpm run typecheck
pnpm --filter pandwind-docs run dev
```

Pandwind is pre-launch. Experimental integrations and bounded proof claims
remain labeled as such; a fixture does not promise universal framework or
migration support.
