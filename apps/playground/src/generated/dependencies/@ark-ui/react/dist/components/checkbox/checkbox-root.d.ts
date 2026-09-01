// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseCheckboxProps } from './use-checkbox.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface CheckboxRootBaseProps extends UseCheckboxProps, PolymorphicProps {
}
export interface CheckboxRootProps extends Assign<HTMLProps<'label'>, CheckboxRootBaseProps> {
}
export declare const CheckboxRoot: ForwardRefExoticComponent<CheckboxRootProps & RefAttributes<HTMLLabelElement>>;
