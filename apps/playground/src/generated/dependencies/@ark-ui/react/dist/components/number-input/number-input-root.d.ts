// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseNumberInputProps } from './use-number-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NumberInputRootBaseProps extends UseNumberInputProps, PolymorphicProps {
}
export interface NumberInputRootProps extends Assign<HTMLProps<'div'>, NumberInputRootBaseProps> {
}
export declare const NumberInputRoot: ForwardRefExoticComponent<NumberInputRootProps & RefAttributes<HTMLDivElement>>;
