# showcase — one design system, three targets

The plans/021 write-once demonstration: **`src/shared-styles.ts` is edited
once**, and three runtimes render its shared base styles. Web and React Native
also apply separate corner-radius extensions; OpenTUI has no radius
representation and keeps its documented refusal behavior.

| target | file                 | lowering                                                                 | runtime          |
| ------ | -------------------- | ------------------------------------------------------------------------ | ---------------- |
| web    | `src/web/App.tsx`    | `createDesignCss(examplePreset)` → resolved declarations via `dss.raw()` | vite             |
| native | `src/native/App.tsx` | `yumcss/react-native` → RN StyleSheet objects                            | react-native-web |
| tui    | `src/tui/app.tsx`    | `yumcss/opentui` → terminal style objects                                | bun + @opentui   |

The shared module is **typed against the preset** (`DesignStyleObject`) so a
token typo fails at the single source, before any target sees it.

The shared base stays inside the three-target vocabulary intersection.
Target-specific corner radii stay explicit; React inline styles receive only
base declarations because they cannot represent nested condition objects.

## Run

```sh
pnpm run test     # browser parity e2e + headless tui parity
pnpm run dev      # web + native page
pnpm tui         # the terminal app (bun)
```

## What the e2e proves

The same `$blue-500` token renders as `rgb(49, 130, 206)` computed style on
web AND native; corners `lg` is an 8px radius on both; and `pad: [4, 8]`
expands per-side in all three targets. Native and TUI resolve the shared
`_dark` status condition at runtime; the web inline-style example uses the
base status because React `style` cannot represent nested selectors.
