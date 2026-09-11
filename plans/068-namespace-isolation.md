# Pandwind-owned CSS namespace

**Status: COMPLETE**

## Decision

Add an optional `namespace` string to the existing CSS/runtime/build option
boundaries. The default remains `pw`, so existing output is byte-for-byte
unchanged when the option is omitted.

The namespace applies to names Pandwind owns for dynamic-value carriers:

- carrier classes such as `pw-color`;
- carrier custom properties such as `--pw-c-color`;
- Vite critical-style markers such as `data-pw-critical`.

`namespace: "app"` therefore produces `app-color`, `--app-c-color`, and
`data-app-critical`.

## Deliberate non-goals

- Hashed atomic classes remain hash-only. Adding a prefix to them would change
  the default CSS ABI and is not needed for the collision that this option is
  solving.
- A caller-provided `ClassNameStrategy` remains authoritative. The namespace
  must not rewrite Tailwind, named-atom, StyleX, or other adapter-owned names.
- Adapter/codemod identifiers and unrelated `pw` strings are not rewritten.
- The namespace is not part of a preset or theme. It controls serialization
  and build/runtime isolation, so it belongs beside `className` and `hashFn`.

## Required pairing

Applications using `css.vars()` with static extraction must pass the same
namespace to the CSS factory and `pandwindCssVite` (or
`pandwindUnpluginCss`). The factory controls the emitted carrier names; the
build plugin controls the matching stylesheet and critical marker.

```ts
const css = createCss(preset, { namespace: "checkout" });

plugins: [pandwindCssVite(preset, { namespace: "checkout" })];
```

The value is intended to be a CSS identifier fragment so it remains safe in
classes, custom properties, and data attributes. Pandwind passes the value
through verbatim; applications should keep it to letters, numbers, `_`, and
`-`, with a non-numeric first character.

## Size and performance constraints

The default path keeps the same strings and cache behavior. The namespace is
resolved once per factory/compiler, not per declaration. The browser runtime
size budget and existing runtime benchmark suite remain required validation
for this change.
