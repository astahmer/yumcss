// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as tour from '@zag-js/tour';
export interface UseTourProps extends Optional<Omit<tour.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseTourReturn extends tour.Api<PropTypes> {
}
export declare const useTour: (props?: UseTourProps) => UseTourReturn;
