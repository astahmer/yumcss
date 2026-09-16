---
title: The tailwind adapter — one stylesheet for both APIs
description: createTwAdapter turns css() into a Tailwind-class emitter; ClassNameStrategy makes the output swappable.
sidebar:
  order: 1
---

`createTwAdapter({ preset, variants, bridge })` lets the primary `css()` API
emit Tailwind classes instead of hashed atoms:

```ts
import { createCss } from "pandwind/css";
import { createTwAdapter } from "pandwind/tw";
import { examplePreset } from "@pandwind/example-preset";
import { bridge, variants } from "./bridge"; // optional artifact from `pandwind-codemod tw generate --bridge`
import { tw } from "./tw";

const twAdapter = createTwAdapter({ preset: examplePreset, variants, bridge });
const css = createCss(examplePreset, { className: twAdapter });

css.class({ color: "$blue-500" }); // "text-blue-500"
tw({ text: "blue-500" }); // "text-blue-500"
```

`bridge.ts` is an optional generated `(property, resolved value) -> utility`
map: Pandwind does not import it automatically. Import it only when the
project chooses the Tailwind class strategy shown above; otherwise it stays
build-time/migration metadata. Preset
tokens that equal a `@theme` value yield the short utility (`$blue-500` ->
`text-blue-500`); anything else falls back to an arbitrary-property class
(`[margin-top:7px]`), which is still real Tailwind CSS. Unrepresentable
declarations — `$input` dynamics, unknown conditions — **throw a clear error**
instead of silently emitting a class that has no CSS in this mode.

The bridge stage of `pandwind-codemod tw generate --bridge` sweeps Tailwind's own class list and keeps only
direct-property utilities that resolve against your `@theme`, so the bridge
stays small (~36 KB for the example preset) and cannot drift from what
Tailwind actually compiles.

The adapter changes the class spelling emitted by `css()`, but it does not turn
`css()` into a Tailwind class-string parser. If a valid Tailwind variant is not
present in the generated metadata — such as a named-group modifier — compose
the literal Tailwind class beside the adapter output:

```ts
import { createCx } from "pandwind/cx";

const cx = createCx({ css });
const className = cx(css.class({ color: "$blue-500" }), "group-hover/item:text-blue-500");
```

Tailwind must see the literal through its normal source scan, or through an
explicit `@source inline(...)`/safelist entry. This fallback is specific to a
Tailwind-owned stylesheet; the native Pandwind engine cannot compile a raw
Tailwind utility string.

## Class-name strategies — one API, swappable output

The tailwind adapter is one instance of a general contract:
`ClassNameStrategy` (see `css/class-name-strategy.ts`). A strategy decides,
per flattened declaration, which class the engine emits — or returns `null`
to fall back to atomic hashing. Two flavors exist:

- **External-compiler strategies** (tailwind): their classes are compiled by
  Tailwind's scanner; nothing joins pandwind's stylesheet.
- **Sheet-backed strategies** (`sheetBacked: true`): their classes are
  compiled by pandwind's own generated stylesheet, exactly like hashed
  atoms — `cx()` merging and the atom registry keep working; only the class
  spelling changes. `pandwindCssVite({ className })` serves their rules from
  the `pandwind:css` virtual module as usual.

The bundled second mode is `createNamedAtomsStrategy()` — readable classes
(`pw-color-red`) instead of hashes, useful when debuggable markup matters more
than minimal bytes:

```ts
import { createCss, createNamedAtomsStrategy } from "pandwind/css";

const css = createCss(examplePreset, {
	className: createNamedAtomsStrategy(),
});
css.class({ color: "$red-500" }); // "pw-color-$red-500" (rule in the generated sheet)
```

Switching modes is a one-option change; call sites never move.
