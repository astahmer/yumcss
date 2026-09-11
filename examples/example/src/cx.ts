import { createCx } from "pandwind/cx";
import { dss } from "./design";

/**
 * App-level cx() merges classes created by the same Pandwind design engine.
 * The shared atom registry lets the runtime preserve property conflicts.
 */
export const cx = createCx({ css: dss });
