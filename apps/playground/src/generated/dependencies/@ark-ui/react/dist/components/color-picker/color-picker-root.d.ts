// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseColorPickerProps } from './use-color-picker.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ColorPickerRootBaseProps extends UseColorPickerProps, UsePresenceProps, PolymorphicProps {
}
export interface ColorPickerRootProps extends Assign<HTMLProps<'div'>, ColorPickerRootBaseProps> {
}
export declare const ColorPickerRoot: ForwardRefExoticComponent<ColorPickerRootProps & RefAttributes<HTMLDivElement>>;
