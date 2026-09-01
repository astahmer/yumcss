// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDatePickerProps } from './use-date-picker.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DatePickerRootBaseProps extends UseDatePickerProps, UsePresenceProps, PolymorphicProps {
}
export interface DatePickerRootProps extends Assign<HTMLProps<'div'>, DatePickerRootBaseProps> {
}
export declare const DatePickerRoot: ForwardRefExoticComponent<DatePickerRootProps & RefAttributes<HTMLDivElement>>;
