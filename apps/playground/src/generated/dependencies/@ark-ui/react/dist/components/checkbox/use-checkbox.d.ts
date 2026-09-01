// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as checkbox from '@zag-js/checkbox';
export interface UseCheckboxProps extends Optional<Omit<checkbox.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseCheckboxReturn extends checkbox.Api<PropTypes> {
}
export declare const useCheckbox: (ownProps?: UseCheckboxProps) => UseCheckboxReturn;
