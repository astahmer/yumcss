// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as scrollArea from '@zag-js/scroll-area';
export interface UseScrollAreaProps extends Optional<Omit<scrollArea.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseScrollAreaReturn extends scrollArea.Api<PropTypes> {
}
export declare const useScrollArea: (props?: UseScrollAreaProps) => UseScrollAreaReturn;
