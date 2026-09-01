// Generated from the workspace-linked pandwind package. Do not edit.
import { DateValue } from '@zag-js/date-picker';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DatePickerValueTextRenderProps {
    value: DateValue;
    index: number;
    valueAsString: string;
    remove: () => void;
}
export interface DatePickerValueTextBaseProps extends PolymorphicProps {
    /**
     * Text to display when no date is selected.
     */
    placeholder?: string | undefined;
    /**
     * A function to render each selected date value.
     * When provided, each date in the selection will be rendered using this function.
     */
    children?: ((props: DatePickerValueTextRenderProps) => React.ReactNode) | undefined;
    /**
     * The separator to use between multiple date values when using default rendering.
     * @default ", "
     */
    separator?: string | undefined;
}
export interface DatePickerValueTextProps extends Assign<HTMLProps<'span'>, DatePickerValueTextBaseProps> {
}
export declare const DatePickerValueText: ForwardRefExoticComponent<DatePickerValueTextProps & RefAttributes<HTMLSpanElement>>;
