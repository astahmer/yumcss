# Plan 005 — Generalize adapter modes (`ClassNameStrategy`)

## Goal

The tw adapter proved "one `css()` API, swappable output": the same declarations can
emit Tailwind utilities instead of atomic hashes. Generalize that contract into an
explicit strategy interface so additional output modes (panda-style atoms with
different naming, stylex-style, or a starlight-style raw string) become plausible
without changing app code.

## Approach (deliberately scoped — do not overbuild)

1. Read `src/css/create-css.ts` (where `ClassNameStrategy` lives) and
   `src/tw/adapter.ts` (the first strategy instance).
2. Extract/formalize the strategy interface from what the tw adapter actually needs
   (declaration → class-or-null, condition mapping, fallback policy). The default
   atomic mode becomes strategy #0, tw adapter strategy #1 — pure refactor,
   byte-identical outputs for both existing modes.
3. Add ONE minimal second consumer to justify the abstraction: the cheapest honest
   mode (e.g. a passthrough/raw-string strategy or a renamed-atoms mode) with its own
   small test proving a `css()` app can switch modes via config and keep compiling.
   Do NOT attempt full panda/stylex emulation — that is future work once a real
   consumer appears.
4. Document the interface contract (JSDoc + a README section under the adapter part).

## Files (territory)

- `src/css/create-css.ts`, `src/tw/adapter.ts`, `README.md`
- tests: `tests/css-tw-parity.test.ts` (must stay green untouched),
  `tests/tw-adapter.test.ts`, new strategy test file

## Gates

- Full gate green; existing parity/adapter suites unchanged and passing.
- Note in an "Outcomes" section appended to this plan: final interface shape, what
  stayed out of scope and why.

## jj discipline

Work only inside your workspace dir. Split/describe logical revisions (refactor feat /
new-mode feat / docs separately). Never touch `/Users/astahmer/dev/pandwind`.

## Outcomes

- Final interface: `ClassNameStrategy { name, sheetBacked?, toClassName(key, value) }`
  in `src/css/class-name-strategy.ts`, accepted anywhere via
  `AnyClassNameStrategy` (object or legacy callable; `normalizeStrategy` wraps).
  The legacy callable form keeps working — `create-css.ts` re-exports it as deprecated.
- Engine split: strategies either back onto an external compiler (tailwind —
  classes stay out of the registry/sheet) or declare `sheetBacked: true`
  (classes join the atom registry and the generated stylesheet selectors).
  `createStylesheet` and `pandwindCssVite` honor sheet-backed names;
  non-sheet-backed modes keep the stylesheet byte-identical.
- Second consumer: `createNamedAtomsStrategy()` (`src/css/named-atoms-strategy.ts`)
  emits readable classes (`pw-color-red`) with the same canonicalization the
  stylesheet generator uses (condition parts sorted), so runtime names and
  generated selectors match byte-for-byte. Covered by tests/named-atoms.test.ts
  incl. cx() merge parity with the default mode.
- Deliberately out of scope in this original wave: full panda/stylex emulation
  and cross-engine CSS-dedup proof. Those were added by the later adapter and
  differential suites; see plans 021 and 032.
- Size: css entry 2256 -> 2406 min bytes (+150, strategy plumbing + named-atoms
  export); snapshot refreshed intentionally. Hard budget 2900 unchanged.
