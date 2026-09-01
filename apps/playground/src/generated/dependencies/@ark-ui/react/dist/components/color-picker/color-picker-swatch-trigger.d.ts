// Generated from the workspace-linked pandwind package. Do not edit.
import { SwatchTriggerProps } from '@zag-js/color-picker';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ColorPickerSwatchTriggerBaseProps extends SwatchTriggerProps, PolymorphicProps {
}
export interface ColorPickerSwatchTriggerProps extends Assign<HTMLProps<'button'>, ColorPickerSwatchTriggerBaseProps> {
}
export declare const ColorPickerSwatchTrigger: ForwardRefExoticComponent<ColorPickerSwatchTriggerProps & RefAttributes<HTMLButtonElement>>;
