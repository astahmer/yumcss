// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as segmentGroup from '@zag-js/radio-group';
export interface UseSegmentGroupProps extends Optional<Omit<segmentGroup.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseSegmentGroupReturn extends segmentGroup.Api<PropTypes> {
}
export declare const useSegmentGroup: (props?: UseSegmentGroupProps) => UseSegmentGroupReturn;
