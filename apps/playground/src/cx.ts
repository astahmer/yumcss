import { createCx } from "pandwind/cx";
import { dss } from "./css.ts";
import { __pandwindConflictConfig as cfg } from "./tw.conflicts.ts";

/**
 * Playground-only exact Tailwind conflict demo. Normal app code should use
 * createCx({ css }) unless arbitrary runtime strings need this catalog.
 */
export const cx = createCx({ css: dss, ...cfg });
