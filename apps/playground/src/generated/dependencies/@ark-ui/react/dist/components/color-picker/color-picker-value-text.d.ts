// Generated from the workspace-linked pandwind package. Do not edit.
import { ColorStringFormat } from '@zag-js/color-utils';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ColorPickerValueTextBaseProps extends PolymorphicProps {
    format?: ColorStringFormat | undefined;
}
export interface ColorPickerValueTextProps extends HTMLProps<'span'>, ColorPickerValueTextBaseProps {
}
export declare const ColorPickerValueText: ForwardRefExoticComponent<ColorPickerValueTextProps & RefAttributes<HTMLDivElement>>;
