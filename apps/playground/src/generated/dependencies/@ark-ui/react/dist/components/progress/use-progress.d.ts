// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as progress from '@zag-js/progress';
export interface UseProgressProps extends Optional<Omit<progress.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseProgressReturn extends progress.Api<PropTypes> {
}
export declare const useProgress: (props?: UseProgressProps) => UseProgressReturn;
