// Generated from the workspace-linked pandwind package. Do not edit.
import { TableProps } from '@zag-js/date-picker';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DatePickerTableBaseProps extends Pick<TableProps, 'columns'>, PolymorphicProps {
}
export interface DatePickerTableProps extends HTMLProps<'table'>, DatePickerTableBaseProps {
}
export declare const DatePickerTable: ForwardRefExoticComponent<DatePickerTableProps & RefAttributes<HTMLTableElement>>;
