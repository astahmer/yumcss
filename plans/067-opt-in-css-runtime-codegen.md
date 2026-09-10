# Opt-in CSS runtime codegen

Status: complete

## Goal

Let non-Vite consumers generate a small, deterministic `createCss` module that
contains the callable CSS core plus only the method attachments they select.
The normal `pandwind/css` entry and the complete source-level API remain
unchanged.

## Design

- Expose the feature through `pandwind-codemod runtime generate`.
- Select methods with `--methods class,vars` (or `call` for the callable core
  only); the default is the complete method set so an omitted option is safe.
- Always emit the callable core and static imports for selected attachments.
- Resolve attachment dependencies centrally; `group` implies `vars`.
- Share the method registry and module renderer with the Vite runtime pruner,
  so the virtual and file-generated forms cannot drift in their imports or
  attachment order.
- Generate a typed wrapper whose callable signature and properties expose only
  the selected methods. Preset-specific style inference remains available.
- Write byte-stable output and support `--check` for CI freshness checks.
- Do not target `createRuntimeCss`, `createRuntimeDesignCss`, or `cx()` in this
  first version. Vite continues to specialize modules automatically.

## Boundaries

The generated file imports the existing private `_runtime/css-*` entries. It
is an artifact tied to the installed Pandwind version, not a new authoring API
or a second runtime implementation. The codegen command owns filesystem
writing; the Pandwind package owns the attachment registry and renderer.

## Acceptance criteria

- [x] CLI parses and validates method selections deterministically.
- [x] `group` output includes `vars`, and every output includes the core.
- [x] Generated types expose only selected methods while preserving preset
      inference for the callable and selected projections.
- [x] `--check` reports missing or stale output without writing it.
- [x] Vite virtual modules use the same registry/renderer as file generation.
- [x] Tests cover call-only, single-method, dependency expansion, invalid
      selections, deterministic output, and check-mode failures.
- [x] Codegen docs and architecture ownership are updated.
