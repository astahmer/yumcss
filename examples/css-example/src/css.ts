import { createUnsafeCss } from "yumcss/unsafe/css";

/**
 * Atomic css() — plain style objects on the app preset, separate from the
 * design-layer vocabulary exposed by dss.
 *
 * NOTE: literal css.class(...) calls must NOT live in this file. The
 * `yumcssExtractVite` extractor only scans calls made through an IMPORT
 * binding named `css` coming from a source whose basename matches
 * `css`/`design` — a file-local const does not qualify (see src/card-b.ts
 * for the working call site).
 */
export const css = createUnsafeCss();
