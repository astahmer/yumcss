// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseDateInputReturn } from './use-date-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseDateInputReturn;
}
export interface DateInputRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface DateInputRootProviderProps extends HTMLProps<'div'>, DateInputRootProviderBaseProps {
}
export declare const DateInputRootProvider: ForwardRefExoticComponent<DateInputRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
