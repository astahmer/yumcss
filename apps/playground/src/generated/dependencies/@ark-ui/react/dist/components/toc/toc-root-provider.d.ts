// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTocReturn } from './use-toc.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseTocReturn;
}
export interface TocRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface TocRootProviderProps extends Assign<HTMLProps<'div'>, TocRootProviderBaseProps> {
}
export declare const TocRootProvider: ForwardRefExoticComponent<TocRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
