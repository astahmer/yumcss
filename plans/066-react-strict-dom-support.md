# Plan 066 — React Strict DOM support

## Status

Complete.

## Context

React Strict DOM (RSD) is a cross-platform React host package. Its public
surface is deliberately split by the package's conditional exports:

- web exports `html.*` host components and a `css` namespace backed by
  StyleX's compiled-style contract;
- native exports the same style authoring shape but resolves styles into
  React Native objects at runtime;
- `css.create` is compiler/runtime-owned, while `compat.native`, providers,
  event normalization, and the strict host prop contract are RSD semantics.

RSD therefore cannot be modeled as another class-name strategy alone. A web
class string is not a valid RSD `style` value, and a raw web style object does
not preserve RSD's atomic CSS behavior. At the same time, copying RSD's
compiler or host runtime into Pandwind would create a second implementation of
an external package's semantics.

## Goal

Support the portable static style path in both directions while preserving the
ownership boundary:

1. Pandwind can emit RSD-compatible style artifacts for web and native hosts.
2. The codemod recognizes documented RSD static APIs and rewrites host usage
   idiomatically for Pandwind or RSD.
3. RSD-specific compiler, native compatibility, and provider semantics remain
   explicit residuals when no equivalent target contract exists.
4. The repository contains executable library, codemod, documentation, and
   example coverage for happy and conservative paths.

## Design

### Library

Add a `react-strict-dom` backend and subpath with an explicit platform option:

- `web` lowers declarations to StyleX-compatible compiled style objects
  (`$$css` marker plus atomic class values) and uses the existing StyleX class
  identity plus Pandwind's stylesheet/runtime-sheet ownership;
- `native` lowers declarations through the existing React Native object policy
  and returns plain style objects suitable for RSD's native `style` prop;
- the backend registry exposes the target identity and capability contract;
- the subpath provides the RSD-shaped named `css.create` convenience without
  importing `react-strict-dom` or bundling its runtime.

The public helper will not reproduce RSD's `compat`, providers, event model,
compiler-only variable/theme APIs, or native pseudo-state machinery. Those are
owned by RSD and are outside a style backend's declaration contract.

### Codemod

Register `react-strict-dom` as a first-class adapter. It owns:

- `css.create` static named maps;
- `css.keyframes` and `css.defineVars` recognition where the semantic IR can
  represent them;
- `html.*` style-host projection;
- package/dependency metadata and official API evidence;
- explicit residuals for `compat.native`, providers, unsupported compiler
  configuration, and runtime-only behavior.

Static RSD to Pandwind conversion will demote `html.*` to intrinsic JSX,
convert `style={...}` carriers to Pandwind host props, and remove the RSD
imports only when the whole host conversion is proven. Pandwind to RSD will
emit `css.create` and `html.*` with the `style` prop, rather than inventing
`className` or a non-existent RSD helper.

The adapter reuses the existing StyleX semantic parsing and numeric policies
where their contracts match; RSD-specific host rewrites remain in the RSD
adapter.

## Acceptance criteria

- [x] web and native backend contract tests pass, including stable artifact
      shape, conditions, and unsupported declarations;
- [x] the RSD subpath has type tests and runtime tests for named static styles;
- [x] codemod source/target tests cover `css.create`, `html.div`, style arrays,
      custom static values, and typed residuals for runtime-only APIs;
- [x] official API matrix and family evidence includes RSD's documented forms;
- [x] a copyable example demonstrates the web and native target paths without
      adding RSD as a Pandwind runtime dependency;
- [x] package builds, typechecks, focused codemod suites, and formatting pass;
- [x] the final docs state the exact compiler/runtime boundary and limitations.

Evidence is split across the focused JJ revisions that introduced the backend,
public surface, codemod, residual hardening, and documentation. The final
validation commands are recorded in the task result; the existing core runtime
size snapshot is updated only for the intentional registry graph change.

## Non-goals

- Bundling `react-strict-dom`, StyleX, React Native, `styleq`, or RSD's Babel
  / PostCSS plugins into Pandwind.
- Reimplementing RSD's strict prop validation, event translation, providers,
  `compat.native`, or platform-specific runtime state.
- Claiming that arbitrary RSD compiler output can be recovered from source text
  without the source project's official compiler/configuration context.
