# React Strict DOM with YumCSS

This is a copyable source example, not a second application workspace. Install
`react-strict-dom` in the consuming project, then copy either platform example
into its React entry point.

- `src/App.tsx` uses YumCSS's web StyleX-compatible artifact with RSD's
  `html.*` and `style` APIs.
- `src/App.native.tsx` uses the same style authoring shape with YumCSS's
  native object backend.

React Strict DOM remains responsible for its platform compiler, host runtime,
and `html.*` component implementation. YumCSS only supplies the style
artifact and does not add RSD or StyleX to an application's dependency graph.

For a web build, add `yumcssExtractVite` with `createStyleXAdapter` to the host's
Vite configuration. Static entries in `css.create({ ... })` are then emitted
into the generated stylesheet while the source keeps using React Strict DOM's
`html.*` and `style` APIs. Native builds use the native YumCSS entry point
and do not run the web stylesheet scanner.
