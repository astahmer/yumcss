---
title: Known limitations
description: What pandwind deliberately does not cover today.
sidebar:
  order: 4
---

- Dynamic values (`tw({ bg: color })` with a variable) can't be statically
  inlined or scanned — same constraint as dynamic class names in plain
  Tailwind. The safelist covers calls that are statically evaluable; fully
  dynamic values need an explicit `@source inline` entry in the safelist
  stylesheet.
- Tailwind overloads utilities like `text-*` (size, color, alignment). One key
  per utility means you use an array for mixed concerns:
  `tw({ text: ["2xl", "gray-900"] })`. Semantic sub-keys (`textSize` /
  `textColor`) are the narrower spellings — see
  [tw()](/api/tw/#semantic-sub-keys-for-overloaded-utilities).
- Dynamic `css()` values (variables, `$input`) aren't covered by the static
  extractor — they need runtime styles, exactly like dynamic Tailwind classes.
- **What about node_modules?** Same answer as Tailwind: the `tw()` inliner
  transforms any module in the graph, but Tailwind's scanner only scans the
  sources it's configured to scan. Classes used by a library component need
  `@source inline "../node_modules/..."` or an explicit safelist entry. The
  css() extractor skips node_modules by default (configurable via
  `include`/`exclude`).
