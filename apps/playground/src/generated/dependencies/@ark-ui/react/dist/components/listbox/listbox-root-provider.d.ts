// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseListboxReturn } from './use-listbox.d.ts';
interface RootProviderProps<T extends CollectionItem> {
    value: UseListboxReturn<T>;
}
export interface ListboxRootProviderBaseProps<T extends CollectionItem> extends RootProviderProps<T>, PolymorphicProps {
}
export interface ListboxRootProviderProps<T extends CollectionItem> extends HTMLProps<'div'>, ListboxRootProviderBaseProps<T> {
}
export type ListboxRootProviderComponent<P = {}> = <T extends CollectionItem>(props: Assign<ListboxRootProviderProps<T>, P> & React.RefAttributes<HTMLDivElement>) => JSX.Element;
export declare const ListboxRootProvider: ListboxRootProviderComponent;
export {};
