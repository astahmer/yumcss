// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseNumberInputReturn } from './use-number-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseNumberInputReturn;
}
export interface NumberInputRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface NumberInputRootProviderProps extends HTMLProps<'div'>, NumberInputRootProviderBaseProps {
}
export declare const NumberInputRootProvider: ForwardRefExoticComponent<NumberInputRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
