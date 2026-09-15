# Safe CSS factory boundary

Status: complete

## Decision

`createCss` in `pandwind/css` requires a preset. The preset binds the CSS
property, token, and condition vocabulary, so the normal import communicates
the semantic guarantees that application code receives.

Open-ended CSS remains available through the deliberately named
`pandwind/unsafe/css` entrypoint:

```ts
import { createUnsafeCss } from "pandwind/unsafe/css";

const unsafeCss = createUnsafeCss();
```

The unsafe factory is for generated code, adapters, and styles whose values
are discovered at runtime. It has the same runtime projections as the safe
factory, but no preset-derived typing or token/condition resolution.

## Boundaries

- `pandwind/css` exports `createCss` and never exports the unsafe factory.
- `createCss()` and options-only calls are rejected by TypeScript and throw at
  runtime with a pointer to `pandwind/unsafe/css`.
- Generated modules and migration emitters use the explicit unsafe import.
- The React Strict DOM lane keeps its separate, intentionally different
  `createCss()` contract.
- The package surface inventory and playground declarations include the new
  public subpath.

## Trade-off

This is a pre-launch breaking change. It adds one explicit import for callers
that need an unbound runtime, but prevents a silent loss of token semantics on
the canonical path and gives humans, tooling, and language models a visible
signal when design-system guarantees are absent.

## Proof

Type-level tests cover the required preset and unsafe escape hatch. Runtime
tests cover both invalid safe-factory calls and package export isolation.
Codemod, Vite, playground, packed-consumer, and generated-artifact tests cover
the explicit unsafe import across the supported integration paths.
