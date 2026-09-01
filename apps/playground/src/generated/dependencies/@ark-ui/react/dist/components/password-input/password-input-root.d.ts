// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePasswordInputProps } from './use-password-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface PasswordInputRootBaseProps extends UsePasswordInputProps, PolymorphicProps {
}
export interface PasswordInputRootProps extends Assign<HTMLProps<'div'>, PasswordInputRootBaseProps> {
}
export declare const PasswordInputRoot: ForwardRefExoticComponent<PasswordInputRootProps & RefAttributes<HTMLDivElement>>;
