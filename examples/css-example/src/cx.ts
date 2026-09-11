import { type CssFn } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { dss } from "./design.ts";

export const cx = createCx({ css: dss as unknown as CssFn<never> });
