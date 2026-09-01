// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePaginationReturn } from './use-pagination.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UsePaginationReturn;
}
export interface PaginationRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface PaginationRootProviderProps extends HTMLProps<'nav'>, PaginationRootProviderBaseProps {
}
export declare const PaginationRootProvider: ForwardRefExoticComponent<PaginationRootProviderProps & RefAttributes<HTMLElement>>;
export {};
