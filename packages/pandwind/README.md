# pandwind

Typed CSS-in-JS with static extraction, runtime CSS variables, and a semantic
interop boundary for migrating between styling systems.

Use `createCss(preset)` from `pandwind/css` for the normal typed compiler
surface. Pair it with `pandwindCssVite()` or an equivalent unplugin so static
calls and the stable rules for `css.vars()` / `css.input()` are emitted at
build time. Use `createRuntimeCss(preset)` from `pandwind/css/runtime` only
when the host needs Pandwind to register and expose a `RuntimeSheet` itself,
such as a runtime-only package or an SSR sheet boundary.

See the repository documentation for setup, presets, bundler plugins, and
the CSS-in-JS migration toolkit.
