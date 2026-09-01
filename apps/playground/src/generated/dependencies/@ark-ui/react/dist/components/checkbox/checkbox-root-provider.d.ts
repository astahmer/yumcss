// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseCheckboxReturn } from './use-checkbox.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseCheckboxReturn;
}
export interface CheckboxRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface CheckboxRootProviderProps extends HTMLProps<'label'>, CheckboxRootProviderBaseProps {
}
export declare const CheckboxRootProvider: ForwardRefExoticComponent<CheckboxRootProviderProps & RefAttributes<HTMLLabelElement>>;
export {};
