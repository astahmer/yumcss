# Usage-aware runtime pruning

Status: complete

## Goal

Keep Pandwind's complete TypeScript API visible while making emitted browser
JavaScript pay only for the runtime methods a module actually uses.

## Design

- Preserve `createCss`, `createRuntimeCss`, `tw`, `cx`, and their public types.
- Split the CSS runtime into a small core plus independently importable method
  attachments.
- Have the existing bundler adapters inspect local factory usage with the
  shared AST scanner and rewrite safe `createCss` imports to a virtual,
  feature-specific runtime module.
- Treat escaping factories (exports, returns, unknown calls, cross-module
  assignments, or dynamic member access) as full-runtime cases.
- Keep static extraction first: completely extracted calls must remove their
  factory import and carry no runtime implementation.
- Keep the unoptimized package entry correct when no bundler plugin is active.

## Safety contract

The optimizer may only remove code after proving the factory's local usage.
Unknown or escaped usage selects the complete method set. Type declarations do
not change; the optimization exists only in emitted JavaScript.

## Validation

- unit tests for usage classification and escape conservatism;
- transform tests for virtual feature modules and import preservation;
- runtime parity tests for every retained method combination;
- size snapshots for call-only, class-only, vars, props, group, and full
  runtime lanes;
- browser bundle checks proving no build-time or Node-only code is included.

## Rejected alternatives

- Runtime feature flags: bundlers cannot reliably constant-fold a factory's
  internal branches across a public function call.
- Lazy getters: they defer allocation but retain all method implementations and
  add per-instance access overhead.
- Shipping a second public API: it fragments the type/DX surface and makes
  optimization opt-in instead of automatic.
