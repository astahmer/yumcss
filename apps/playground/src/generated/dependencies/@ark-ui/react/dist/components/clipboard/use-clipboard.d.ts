// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as clipboard from '@zag-js/clipboard';
export interface UseClipboardProps extends Optional<Omit<clipboard.Props, 'getRootNode'>, 'id'> {
}
export interface UseClipboardReturn extends clipboard.Api<PropTypes> {
}
export declare const useClipboard: (props?: UseClipboardProps) => UseClipboardReturn;
