# `define.preset({ web: ... })` build-time web contract

**Status: complete — narrow preset-owned web CSS, Vite emission, library artifacts, tests, and docs shipped**

## Current pre-launch schema

The current library artifact uses `pandwind.lib/1`, including the `web` CSS
and cascade-layer fields. Because the artifact has not been published, its
producer and consumers use this one contract directly; generated artifacts
must be regenerated when the contract changes.

## Decision

Pandwind now supports a deliberately narrow `web` section on `define.preset`.
It is a build-time contract for browser-global CSS that is naturally owned by
the same design-system package as the tokens. It is not a replacement for CSS
and it does not add a runtime stylesheet side effect.

```ts
const preset = define.preset(theme, {
	conditions: {},
	properties: { color: { $tokens: "colors" } },
	web: {
		globals: {
			":root": { color: "$gray-900" },
		},
		keyframes: {
			fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
		},
		fontFaces: {
			body: { family: "Brand", src: 'url("/fonts/brand.woff2") format("woff2")' },
		},
	},
});
```

The compiler emits `preset.web` through `createStylesheet`, the Vite and
Unplugin virtual stylesheet, and `pandwind.lib/1` artifacts. Route splitting
keeps it in the common bucket. `createRuntimeStylesheet` intentionally does
not consume it: importing a preset must not create browser-global runtime
work, and runtime-created globals already have the explicit semantic-rule
contract.

## Supported surface

- `web.globals` is a sorted selector-to-flat-declaration map. Declaration
  values may be scalar CSS values, numbers, or preset token references. The
  selector may be complex CSS, but it cannot be an at-rule or a nested rule.
- `web.keyframes` is a sorted map of explicit CSS animation names to flat
  `from`/`to`/percentage steps. Names are emitted exactly as CSS identifiers;
  no counter or package-global registry is involved. Token values resolve
  through the same token-variable path as atomic and component-local keyframe
  declarations.
- `web.fontFaces` is a sorted label-to-descriptor map. The label is a stable
  source key; the emitted rule uses the typed `family`, `src`, and modern
  descriptor fields.
- Empty and nullish declarations are omitted. Invalid selectors, properties,
  keyframe steps, names, descriptors, and non-scalar values fail closed with a
  `pandwind: preset.web` diagnostic.

## Deliberate boundary

Ordinary authored CSS remains the complete escape hatch for resets, cascade
layers, `@supports`, `@property`, nesting, arbitrary at-rules, vendor syntax,
CSS authored outside TypeScript, and library styles that need the host
bundler's native source maps or import ordering. The typed lane does not try to
be a second CSS parser.

The generated web CSS is included in the library artifact and participates in
preset compatibility hashing. A consumer therefore cannot silently combine a
library's web contract with different preset semantics; incompatible artifacts
fail before CSS is served.

## Evidence

- `packages/pandwind/src/types/typings.ts` defines the public `PresetWeb`
  contract.
- `packages/pandwind/src/css/preset-web.ts` owns deterministic validation and
  serialization.
- `packages/pandwind/src/css/create-stylesheet.ts` resolves web declarations
  through the normal token/value compiler and exposes `gen.web()`.
- `packages/pandwind/src/vite/css-core.ts` emits web CSS in normal and common
  split output, including external-compiler mode.
- `packages/pandwind/src/vite/lib-artifact.ts` and
  `packages/codemod/src/lib/build.ts` carry the generated section through the
  versioned `pandwind.lib/1` contract.
- `packages/pandwind/tests/preset-web.test.ts` covers deterministic output,
  used-token emission, split-bucket ownership, and the authored-CSS boundary.
- The measured build-time stylesheet generator is now 28.617 KB min / 10.547
  KB gzip, up from 24.998 KB / 9.459 KB; the browser runtime entries do not
  import this serializer, and the dedicated ceiling is 30 KB / 11.5 KB.
