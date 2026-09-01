// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseRadioGroupProps } from './use-radio-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface RadioGroupRootBaseProps extends UseRadioGroupProps, PolymorphicProps {
}
export interface RadioGroupRootProps extends Assign<HTMLProps<'div'>, RadioGroupRootBaseProps> {
}
export declare const RadioGroupRoot: ForwardRefExoticComponent<RadioGroupRootProps & RefAttributes<HTMLDivElement>>;
