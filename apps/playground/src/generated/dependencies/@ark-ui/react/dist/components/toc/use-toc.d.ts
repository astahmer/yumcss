// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as toc from '@zag-js/toc';
export interface UseTocProps extends Optional<Omit<toc.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseTocReturn extends toc.Api<PropTypes> {
}
export declare const useToc: (props?: UseTocProps) => UseTocReturn;
