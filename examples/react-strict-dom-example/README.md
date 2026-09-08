# React Strict DOM with Pandwind

This is a copyable source example, not a second application workspace. Install
`react-strict-dom` in the consuming project, then copy either platform example
into its React entry point.

- `src/App.tsx` uses Pandwind's web StyleX-compatible artifact with RSD's
  `html.*` and `style` APIs.
- `src/App.native.tsx` uses the same style authoring shape with Pandwind's
  native object backend.

React Strict DOM remains responsible for its platform compiler, host runtime,
and `html.*` component implementation. Pandwind only supplies the style
artifact and does not add RSD or StyleX to an application's dependency graph.
