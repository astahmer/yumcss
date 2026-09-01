// Generated from the workspace-linked pandwind package. Do not edit.
import { SwatchProps } from '@zag-js/color-picker';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface ValueSwatchProps extends Omit<SwatchProps, 'value'> {
}
export interface ColorPickerValueSwatchBaseProps extends ValueSwatchProps, PolymorphicProps {
}
export interface ColorPickerValueSwatchProps extends HTMLProps<'div'>, ColorPickerValueSwatchBaseProps {
}
export declare const ColorPickerValueSwatch: ForwardRefExoticComponent<ColorPickerValueSwatchProps & RefAttributes<HTMLDivElement>>;
export {};
