// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSwitchReturn } from './use-switch.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseSwitchReturn;
}
export interface SwitchRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface SwitchRootProviderProps extends HTMLProps<'label'>, SwitchRootProviderBaseProps {
}
export declare const SwitchRootProvider: ForwardRefExoticComponent<SwitchRootProviderProps & RefAttributes<HTMLLabelElement>>;
export {};
