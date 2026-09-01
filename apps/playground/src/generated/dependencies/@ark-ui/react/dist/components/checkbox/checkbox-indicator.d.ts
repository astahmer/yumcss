// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface CheckboxIndicatorBaseProps extends PolymorphicProps {
    indeterminate?: boolean | undefined;
}
export interface CheckboxIndicatorProps extends HTMLProps<'div'>, CheckboxIndicatorBaseProps {
}
export declare const CheckboxIndicator: ForwardRefExoticComponent<CheckboxIndicatorProps & RefAttributes<HTMLDivElement>>;
