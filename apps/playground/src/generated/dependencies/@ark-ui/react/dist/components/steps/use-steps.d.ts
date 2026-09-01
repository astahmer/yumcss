// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as steps from '@zag-js/steps';
export interface UseStepsProps extends Optional<Omit<steps.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseStepsReturn extends steps.Api<PropTypes> {
}
export declare function useSteps(props?: UseStepsProps): UseStepsReturn;
