// Generated from the workspace-linked pandwind package. Do not edit.
import { type CreateCssOptions, type CssFn } from "../css/create-css.d.ts";
import type { DesignPreset, DesignStyleObject } from "./types.d.ts";
export declare const createDesignCss: <TPreset extends DesignPreset>(preset: TPreset, options?: CreateCssOptions) => CssFn<DesignStyleObject<TPreset>>;
export type { DesignPreset, DesignStyleObject } from "./types.d.ts";
