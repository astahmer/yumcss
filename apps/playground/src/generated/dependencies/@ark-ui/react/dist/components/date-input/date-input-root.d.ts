// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseDateInputProps } from './use-date-input.d.ts';
import { Assign } from '../../types.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DateInputRootBaseProps extends UseDateInputProps, PolymorphicProps {
}
export interface DateInputRootProps extends Assign<HTMLProps<'div'>, DateInputRootBaseProps> {
}
export declare const DateInputRoot: ForwardRefExoticComponent<DateInputRootProps & RefAttributes<HTMLDivElement>>;
