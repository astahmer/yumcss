import { type CssFn } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { dcss } from "./design.ts";

export const cx = createCx({ css: dcss as unknown as CssFn<never> });
