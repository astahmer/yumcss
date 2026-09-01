// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseCheckboxGroupContext } from './use-checkbox-group-context.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface ProviderProps {
    value: UseCheckboxGroupContext;
}
export interface CheckboxGroupProviderBaseProps extends ProviderProps, PolymorphicProps {
}
export interface CheckboxGroupProviderProps extends Assign<HTMLProps<'div'>, CheckboxGroupProviderBaseProps> {
}
export declare const CheckboxGroupProvider: ForwardRefExoticComponent<CheckboxGroupProviderProps & RefAttributes<HTMLDivElement>>;
export {};
