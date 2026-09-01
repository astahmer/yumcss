// Generated from the workspace-linked pandwind package. Do not edit.
import { isActiveElement } from './node.d.ts';
import { HTMLElementWithValue } from './types.d.ts';
import '@zag-js/types';

interface ScopeContext {
    getRootNode?: (() => Document | ShadowRoot | Node) | undefined;
}
declare function createScope<T>(methods: T): {
    getRootNode: (ctx: ScopeContext) => Document | ShadowRoot;
    getDoc: (ctx: ScopeContext) => Document;
    getWin: (ctx: ScopeContext) => Window & typeof globalThis;
    getActiveElement: (ctx: ScopeContext) => HTMLElement | null;
    isActiveElement: typeof isActiveElement;
    getById: <T_1 extends Element = HTMLElement>(ctx: ScopeContext, id: string) => T_1 | null;
    setValue: <T_1 extends HTMLElementWithValue>(elem: T_1 | null, value: string | number | null | undefined) => void;
} & T;

export { type ScopeContext, createScope };
