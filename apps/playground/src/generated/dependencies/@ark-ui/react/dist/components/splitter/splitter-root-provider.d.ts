// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSplitterReturn } from './use-splitter.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseSplitterReturn;
}
export interface SplitterRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface SplitterRootProviderProps extends HTMLProps<'div'>, SplitterRootProviderBaseProps {
}
export declare const SplitterRootProvider: ForwardRefExoticComponent<SplitterRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
