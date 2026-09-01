// Generated from the workspace-linked pandwind package. Do not edit.
import { MaybeElementOrFn } from './types.d.ts';
import '@zag-js/types';

interface ObserveAttributeOptions {
    attributes: string[];
    callback(record: MutationRecord): void;
    defer?: boolean | undefined;
}
declare function observeAttributes(nodeOrFn: MaybeElementOrFn, options: ObserveAttributeOptions): () => void;
interface ObserveChildrenOptions {
    callback: MutationCallback;
    defer?: boolean | undefined;
}
declare function observeChildren(nodeOrFn: MaybeElementOrFn, options: ObserveChildrenOptions): () => void;

export { type ObserveAttributeOptions, type ObserveChildrenOptions, observeAttributes, observeChildren };
