// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as timer from '@zag-js/timer';
export interface UseTimerProps extends Optional<Omit<timer.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseTimerReturn extends timer.Api<PropTypes> {
}
export declare const useTimer: (props?: UseTimerProps) => UseTimerReturn;
