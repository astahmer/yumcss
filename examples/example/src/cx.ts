import { createCx } from "yumcss/cx";
import { dss } from "./design";

/**
 * App-level cx() merges classes created by the same YumCSS design engine.
 * The shared atom registry lets the runtime preserve property conflicts.
 */
export const cx = createCx({ css: dss });
