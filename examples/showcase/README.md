# showcase — one design system, three targets

The plans/021 write-once demonstration: **`src/shared-styles.ts` is edited
once**, and three runtimes render it:

| target | file                 | lowering                                                                 | runtime          |
| ------ | -------------------- | ------------------------------------------------------------------------ | ---------------- |
| web    | `src/web/App.tsx`    | `createDesignCss(examplePreset)` → resolved declarations via `dss.raw()` | vite             |
| native | `src/native/App.tsx` | `pandwind/react-native` → RN StyleSheet objects                          | react-native-web |
| tui    | `src/tui/app.tsx`    | `pandwind/opentui` → terminal style objects                              | bun + @opentui   |

The shared module is **typed against the preset** (`DesignStyleObject`) so a
token typo fails at the single source, before any target sees it.

Only the intersection of all three vocabulary subsets lives here —
typography is refused by pandwind/opentui (terminals own fonts), which is
the per-backend subset story working as designed.

## Run

```sh
pnpm run test     # browser parity e2e + headless tui parity
pnpm run dev      # web + native page
pnpm tui         # the terminal app (bun)
```

## What the e2e proves

The same `$blue-500` token renders as `rgb(49, 130, 206)` computed style on
web AND native; corners `lg` is 8px radius / 8px cells respectively;
`pad: [4, 8]` expands per-side in both grammars; and the shared `_dark`
condition flips status to `$gray-900` on every target that resolves
conditions at runtime.
