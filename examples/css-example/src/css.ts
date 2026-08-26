import { createCss } from "pandwind/css";

/**
 * Raw atomic css() — plain style objects, same engine family, no design
 * vocabulary.
 *
 * NOTE: literal css.class(...) calls must NOT live in this file. The
 * `pandwindCssVite` extractor only scans calls made through an IMPORT
 * binding named `css` coming from a source whose basename matches
 * `css`/`design` — a file-local const does not qualify (see src/card-b.ts
 * for the working call site).
 */
export const css = createCss();
