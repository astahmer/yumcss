// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePasswordInputReturn } from './use-password-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UsePasswordInputReturn;
}
export interface PasswordInputRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface PasswordInputRootProviderProps extends HTMLProps<'div'>, PasswordInputRootProviderBaseProps {
}
export declare const PasswordInputRootProvider: ForwardRefExoticComponent<PasswordInputRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
