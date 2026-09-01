// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseRadioGroupReturn } from './use-radio-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseRadioGroupReturn;
}
export interface RadioGroupRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface RadioGroupRootProviderProps extends HTMLProps<'div'>, RadioGroupRootProviderBaseProps {
}
export declare const RadioGroupRootProvider: ForwardRefExoticComponent<RadioGroupRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
