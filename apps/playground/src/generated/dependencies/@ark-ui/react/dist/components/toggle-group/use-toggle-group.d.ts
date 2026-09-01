// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as toggleGroup from '@zag-js/toggle-group';
export interface UseToggleGroupProps extends Optional<Omit<toggleGroup.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseToggleGroupReturn extends toggleGroup.Api<PropTypes> {
}
export declare const useToggleGroup: (props?: UseToggleGroupProps) => UseToggleGroupReturn;
