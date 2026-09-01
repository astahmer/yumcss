// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SelectValueTextBaseProps extends PolymorphicProps {
    /**
     * Text to display when no value is selected.
     */
    placeholder?: string | undefined;
}
export interface SelectValueTextProps extends HTMLProps<'span'>, SelectValueTextBaseProps {
}
export declare const SelectValueText: ForwardRefExoticComponent<SelectValueTextProps & RefAttributes<HTMLSpanElement>>;
