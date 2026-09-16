# Feature Plan: CSS fallback declaration chains

**Status:** Complete
**Created:** 2026-09-16
**Owner:** Pandwind maintainers

## 1. Summary and context

Some CSS features need progressive fallbacks, such as `position: sticky` with
older vendor-prefixed or fixed-position alternatives. A normal Pandwind atom
represents one property/value pair, so an array cannot represent this feature:
arrays already mean indexed style values during flattening.

## 2. Goals

- Add a standalone `firstThatWorks(...values)` helper from `pandwind/css`.
- Keep the preferred value first in authored code and emit declarations in
  reverse order so the browser selects the most capable supported value.
- Preserve one atomic class identity for the entire fallback chain so `cx()`
  continues to merge it by CSS property.
- Support preset token resolution, numeric property normalization, static Vite
  extraction, sheet-backed strategies, and the runtime stylesheet.
- Keep the fallback representation opaque and tree-shakable rather than adding
  fallback metadata to every style object or `CssFn` method.
- Fail explicitly in `css.vars()` and external class-name strategies that do
  not own a Pandwind stylesheet; never emit an orphan class or inline marker.

## 3. Non-goals

- Do not make this a general runtime “try values” or feature-detection API.
- Do not use arrays as the public representation.
- Do not add a `css.firstThatWorks` method; the helper is a value constructor,
  not a CSS projection.
- Do not make fallback chains valid for the `colorPalette` selector or the
  dynamic `css.vars()` carrier.

## 4. Design

`firstThatWorks("sticky", "-webkit-sticky", "fixed")` returns a branded,
opaque string containing the ordered values. The private encoding is recognized
only by Pandwind's declaration compiler and stylesheet lowerers. Runtime and
build-time paths normalize each value for the target property, use the encoded
chain as the atom identity, and serialize the normalized values in reverse:

```css
.atom {
	position: fixed;
	position: -webkit-sticky;
	position: sticky;
}
```

Vite only evaluates calls to `firstThatWorks` when the helper is imported from
the real `pandwind/css` module. Unknown same-named local functions remain
dynamic. Reusable top-level helper constants are included in finite stylesheet
candidate extraction.

## 5. Validation

- Runtime and pure stylesheet output tests cover declaration order, numeric
  normalization, `cx` conflict merging, sheet-backed strategies, runtime
  registration, invalid `css.vars()` use, and CSS parser validity.
- TSTyche covers the branded value, CSS property acceptance, minimum arity, and
  scalar argument restrictions.
- Vite tests cover direct helper calls and reusable helper constants.
- Runtime-size snapshots record the intentional shared-runtime cost: the
  basic CSS bundle is 12,943 minified / 5,165 gzip bytes, while the fully
  extracted generated `tw` + `cx` bundle remains 51 / 71 bytes.
- Package typecheck, focused Vitest/TSTyche suites, formatting, and build pass.
