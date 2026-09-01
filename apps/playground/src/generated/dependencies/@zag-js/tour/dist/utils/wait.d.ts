// Generated from the workspace-linked pandwind package. Do not edit.
import { WaitForOptions, WaitForPromiseReturn } from '@zag-js/dom-query';
export { WaitForOptions as WaitOptions, waitForElement, waitForPromise } from '@zag-js/dom-query';

type EditableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
declare function waitForElementValue(target: () => EditableElement | null, value: string, options: WaitForOptions): WaitForPromiseReturn<void>;

export { waitForElementValue };
