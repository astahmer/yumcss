// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseProgressReturn } from './use-progress.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseProgressReturn;
}
export interface ProgressRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface ProgressRootProviderProps extends HTMLProps<'div'>, ProgressRootProviderBaseProps {
}
export declare const ProgressRootProvider: ForwardRefExoticComponent<ProgressRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
