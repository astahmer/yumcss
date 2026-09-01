// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseColorPickerReturn } from './use-color-picker.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseColorPickerReturn;
}
export interface ColorPickerRootProviderBaseProps extends RootProviderProps, UsePresenceProps, PolymorphicProps {
}
export interface ColorPickerRootProviderProps extends HTMLProps<'div'>, ColorPickerRootProviderBaseProps {
}
export declare const ColorPickerRootProvider: ForwardRefExoticComponent<ColorPickerRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
