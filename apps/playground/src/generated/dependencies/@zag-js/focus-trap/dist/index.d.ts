// Generated from the workspace-linked pandwind package. Do not edit.
export { FocusTrap } from './focus-trap.d.ts';
import { FocusTrapOptions } from './types.d.ts';

type ElementOrGetter = HTMLElement | null | (() => HTMLElement | null);
type ElementsOrGetter = ElementOrGetter | ElementOrGetter[];
interface TrapFocusOptions extends Omit<FocusTrapOptions, "document"> {
}
declare function trapFocus(el: ElementsOrGetter, options?: TrapFocusOptions): () => void;

export { FocusTrapOptions, type TrapFocusOptions, trapFocus };
