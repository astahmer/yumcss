# `definePreset.web` decision notes

**Status: decision deferred — notes only; no API or implementation added**

## Question

Should Pandwind extend `definePreset` with a web-owned section such as
`web.globals`, `web.keyframes`, and `web.fontFaces`, so browser-global CSS can
be authored in TypeScript and emitted at build time?

The current implementation does not have this API. `definePreset` currently
binds tokens to CSS config, conditions, properties, and strictness. The current
web strategy is explicit `.css` imports owned by the host bundler.

## Option A — keep explicit authored CSS imports (current)

```ts
import "@acme/brand/styles.css";
```

Pros:

- Full CSS fidelity: resets, selectors, layers, supports, properties,
  keyframes, fonts, vendor syntax, and future CSS work without API lag.
- Uses the web platform and host bundler's existing ordering, extraction,
  source maps, minification, and code-splitting behavior.
- Package libraries can export ordinary CSS assets without requiring a
  Pandwind-specific runtime or generated contract.
- Keeps the frozen Pandwind styling API small and avoids a second CSS parser/
  serializer inside the preset system.
- Works for CSS authored by teams that do not use TypeScript.

Cons:

- Token references in authored CSS are not TypeScript-checked.
- A consumer must import the stylesheet explicitly and understand its ownership
  and ordering.
- Tooling can observe the import edge, but cannot provide a typed symbol for a
  keyframe name or font family without an additional convention.
- A library needs a documented token custom-property bridge when authored CSS
  consumes preset values.

## Option B — add `definePreset({ web: ... })`

Possible shape, for discussion only:

```ts
definePreset(theme, {
	/* existing preset fields */
	web: {
		keyframes: { fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } } },
		fontFaces: { body: { family: "Brand", src: "url(...)" } },
		globals: { ":root": { color: "$gray-900" } },
	},
});
```

Pros:

- Build-time ownership makes global output discoverable from the preset and
  potentially lets token references receive TypeScript checking.
- A package can export one preset plus its generated web CSS contract.
- Generated names could be deterministic and collision-safe across packages.
- Analyze/inspector could report authored global rules as first-class generated
  artifacts rather than only as CSS import edges.
- A build-time-only implementation could preserve zero browser runtime cost.

Cons:

- `globals` is effectively a second CSS language: selectors, nesting,
  declarations, at-rules, ordering, layers, and browser-specific syntax all
  need semantics or an escape hatch.
- `keyframes`, `font-face`, `@property`, `@supports`, and layers have different
  naming, ordering, and dependency rules; one broad `web` object risks a large,
  vague API.
- Token type safety is incomplete unless the serializer understands every CSS
  value position where a token may appear, including strings and shorthands.
- Cross-bundler virtual CSS, package composition, source maps, HMR, SSR, and
  CSS code-splitting become Pandwind responsibilities.
- Global side effects and import ordering become harder to reason about when a
  preset is imported indirectly.
- It overlaps with mature authored-CSS tooling while still needing a raw CSS
  escape hatch, making the API larger without removing CSS files.
- Changing preset output becomes a potentially breaking CSS ABI for package
  consumers.

## Option C — a separate `defineWebCss` / `.css.ts` module

This would keep design tokens and browser-global authoring separate from the
preset itself, closer to a build-time CSS module. It could return typed names
for keyframes/fonts and emit CSS, while ordinary `.css` remains the escape
hatch.

Pros:

- Avoids making every design preset carry global side effects.
- Gives package authors an explicit module boundary and makes generated names
  importable.
- Leaves room for token-aware declarations without pretending all CSS belongs
  in `definePreset`.

Cons:

- Adds another public API and build entrypoint to document and support.
- Still requires the serializer, CSS dependency graph, ordering, and
  cross-bundler work from Option B.
- Splits authored web styles between `.css` and `.css.ts`, which may increase
  rather than reduce conceptual load.

## Recommendation for the eventual design session

Keep Option A as the default and compatibility floor. If a real package-library
need justifies build-time TypeScript primitives, investigate Option C before
putting `web` directly on `definePreset`: isolate side effects, make generated
names explicit, support token custom properties first, and retain ordinary CSS
as the complete escape hatch.

Do not implement any of these options in the current evidence wave.
