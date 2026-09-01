// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as slider from '@zag-js/slider';
export interface UseSliderProps extends Optional<Omit<slider.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseSliderReturn extends slider.Api<PropTypes> {
}
export declare const useSlider: (props?: UseSliderProps) => UseSliderReturn;
