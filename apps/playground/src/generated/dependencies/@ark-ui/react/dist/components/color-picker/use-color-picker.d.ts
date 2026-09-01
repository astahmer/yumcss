// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as colorPicker from '@zag-js/color-picker';
export interface UseColorPickerProps extends Optional<Omit<colorPicker.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseColorPickerReturn extends colorPicker.Api<PropTypes> {
}
export declare const useColorPicker: (props?: UseColorPickerProps) => UseColorPickerReturn;
