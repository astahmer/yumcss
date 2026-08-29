---
name: pandwind-migrate-repo
description: Migrate a real repository from Tailwind, Panda, StyleX, styled-components, Emotion, MUI, Chakra, Mantine, Linaria, JSS, Vanilla Extract, Stitches, or another styling system to Pandwind. Use when converting a website or component library, auditing migration coverage, proving static CSS parity, or adding a source adapter.
---

# Pandwind repository migration

## Quick start

1. Preserve the source checkout. Work in a new JJ workspace or disposable
   output directory, and pin the source commit before changing anything.
2. Identify the framework, package manager, build commands, SSR/RSC mode,
   styling packages, theme sources, generated files, and all entry points.
3. Generate Pandwind metadata first: preset, `tailwind.css`, `tw.ts`,
   `types.d.ts`, `bridge.ts`, and the scanner output. Treat generated files as
   outputs, never hand-edit them.
4. Run a dry audit with `--to=keep`, then run codemod passes with `--diff`.
   Review every edit before using `--write`; reruns must be idempotent.
5. Migrate merge helpers, static class strings, and static CSS-in-JS calls
   before dynamic code. Prefer `tw()`/`css.class()` and `cx()` for static code.
6. Lower safe dynamic declarations to static classes plus `css.vars()`. Keep
   runtime CSS only for semantics that cannot safely be represented statically.
7. Typecheck, lint, test, build, and run the browser/SSR proof matrix before
   claiming success. Read [REFERENCE.md](REFERENCE.md) for the full workflow.

## Non-negotiable rules

- Never silently drop a declaration, selector, theme dependency, composition,
  plugin transform, or framework behavior. Emit a structured residual or add
  the missing adapter/lowering.
- Migration is a pipeline: source adapter → StyleProgram/SwapIR → target
  adapter → validator; do not create bespoke `XToPandwind` branches.
- Static extraction is the default. Runtime CSS is an explicit, measured
  fallback—not the normal answer for dynamic values.
- Keep adapter-specific logic inside its adapter. Shared runners consume
  interfaces, registries, scanner results, and neutral IR only.
- Compare canonical CSS and browser behavior, not generated class names or
  style-node placement. Prove SSR, hydration, and streaming/RSC where used.
- Record source commit, commands, counts, residuals, CSS bytes, screenshots,
  and validation results in a checked-in evidence report.

## Definition of done

A migration is done only when the source builds and runs, the target has zero
unexpected residuals, every intentional fallback is explained, all claimed
routes/states pass browser and server validation, output CSS is equal or
smaller (or the delta is explicitly accepted), and the migration can be
repeated from the pinned source commit.

See [REFERENCE.md](REFERENCE.md) and [EXAMPLES.md](EXAMPLES.md).
