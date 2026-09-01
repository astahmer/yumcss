// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseCheckboxGroupProps } from './use-checkbox-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface CheckboxGroupBaseProps extends UseCheckboxGroupProps, PolymorphicProps {
}
export interface CheckboxGroupProps extends Assign<HTMLProps<'div'>, CheckboxGroupBaseProps> {
}
export declare const CheckboxGroup: ForwardRefExoticComponent<CheckboxGroupProps & RefAttributes<HTMLDivElement>>;
