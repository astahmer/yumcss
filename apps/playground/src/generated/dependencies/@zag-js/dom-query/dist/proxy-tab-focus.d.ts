// Generated from the workspace-linked pandwind package. Do not edit.
import { GetShadowRootOption } from './tabbable.d.ts';
import { MaybeElement, MaybeElementOrFn } from './types.d.ts';
import '@zag-js/types';

interface ProxyTabFocusOptions<T = MaybeElement> {
    triggerElement?: T | undefined;
    onFocus?: ((elementToFocus: HTMLElement) => void) | undefined;
    onFocusEnter?: VoidFunction | undefined;
    defer?: boolean | undefined;
    getShadowRoot?: GetShadowRootOption | undefined;
}
declare function proxyTabFocus(container: MaybeElementOrFn, options: ProxyTabFocusOptions<MaybeElementOrFn>): () => void;

export { type ProxyTabFocusOptions, proxyTabFocus };
