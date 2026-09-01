// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDatePickerReturn } from './use-date-picker.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseDatePickerReturn;
}
export interface DatePickerRootProviderBaseProps extends RootProviderProps, UsePresenceProps, PolymorphicProps {
}
export interface DatePickerRootProviderProps extends HTMLProps<'div'>, DatePickerRootProviderBaseProps {
}
export declare const DatePickerRootProvider: ForwardRefExoticComponent<DatePickerRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
