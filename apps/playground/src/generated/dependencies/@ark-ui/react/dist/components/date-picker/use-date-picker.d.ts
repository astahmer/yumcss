// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as datePicker from '@zag-js/date-picker';
export interface UseDatePickerProps extends Optional<Omit<datePicker.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseDatePickerReturn extends datePicker.Api<PropTypes> {
}
export declare const useDatePicker: (props?: UseDatePickerProps) => UseDatePickerReturn;
