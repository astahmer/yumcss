// Generated from the workspace-linked pandwind package. Do not edit.
import { MaybeFn, MaybeRectElement, MaybeElement, PositioningOptions } from './types.d.ts';
import '@floating-ui/dom';

declare function getPlacement(referenceOrFn: MaybeFn<MaybeRectElement>, floatingOrFn: MaybeFn<MaybeElement>, opts?: PositioningOptions & {
    defer?: boolean | undefined;
}): () => void;

export { getPlacement };
