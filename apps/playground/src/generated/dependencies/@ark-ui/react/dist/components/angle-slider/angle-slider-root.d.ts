// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseAngleSliderProps } from './use-angle-slider.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface AngleSliderRootBaseProps extends UseAngleSliderProps, PolymorphicProps {
}
export interface AngleSliderRootProps extends Assign<HTMLProps<'div'>, AngleSliderRootBaseProps> {
}
export declare const AngleSliderRoot: ForwardRefExoticComponent<AngleSliderRootProps & RefAttributes<HTMLDivElement>>;
