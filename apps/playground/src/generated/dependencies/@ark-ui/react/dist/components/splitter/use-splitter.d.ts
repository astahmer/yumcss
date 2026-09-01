// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as splitter from '@zag-js/splitter';
export interface UseSplitterProps extends Optional<Omit<splitter.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseSplitterReturn extends splitter.Api<PropTypes> {
}
export declare const useSplitter: (props: UseSplitterProps) => UseSplitterReturn;
