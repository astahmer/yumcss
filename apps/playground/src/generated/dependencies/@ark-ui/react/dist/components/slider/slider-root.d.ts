// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSliderProps } from './use-slider.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SliderRootBaseProps extends UseSliderProps, PolymorphicProps {
}
export interface SliderRootProps extends Assign<HTMLProps<'div'>, SliderRootBaseProps> {
}
export declare const SliderRoot: ForwardRefExoticComponent<SliderRootProps & RefAttributes<HTMLDivElement>>;
