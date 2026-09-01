// Generated from the workspace-linked pandwind package. Do not edit.
import type { EmotionCache } from '@emotion/utils';
import { StylisPlugin } from "./types.d.ts";
export interface Options {
    nonce?: string;
    stylisPlugins?: Array<StylisPlugin>;
    key: string;
    container?: Node;
    speedy?: boolean;
    /** @deprecate use `insertionPoint` instead */
    prepend?: boolean;
    insertionPoint?: HTMLElement;
}
declare let createCache: (options: Options) => EmotionCache;
export default createCache;
export type { EmotionCache };
export type { StylisElement, StylisPlugin, StylisPluginCallback } from "./types.d.ts";
