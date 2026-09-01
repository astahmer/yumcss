// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseToggleGroupReturn } from './use-toggle-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseToggleGroupReturn;
}
export interface ToggleGroupRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface ToggleGroupRootProviderProps extends HTMLProps<'div'>, ToggleGroupRootProviderBaseProps {
}
export declare const ToggleGroupRootProvider: ForwardRefExoticComponent<ToggleGroupRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
