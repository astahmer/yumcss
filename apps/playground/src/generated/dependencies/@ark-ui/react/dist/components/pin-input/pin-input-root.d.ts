// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePinInputProps } from './use-pin-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface PinInputRootBaseProps extends UsePinInputProps, PolymorphicProps {
}
export interface PinInputRootProps extends Assign<HTMLProps<'div'>, PinInputRootBaseProps> {
}
export declare const PinInputRoot: ForwardRefExoticComponent<PinInputRootProps & RefAttributes<HTMLDivElement>>;
