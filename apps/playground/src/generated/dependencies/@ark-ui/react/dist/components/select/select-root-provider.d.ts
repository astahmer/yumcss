// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseSelectReturn } from './use-select.d.ts';
interface RootProviderProps<T extends CollectionItem> {
    value: UseSelectReturn<T>;
}
export interface SelectRootProviderBaseProps<T extends CollectionItem> extends RootProviderProps<T>, UsePresenceProps, PolymorphicProps {
}
export interface SelectRootProviderProps<T extends CollectionItem> extends HTMLProps<'div'>, SelectRootProviderBaseProps<T> {
}
export type SelectRootProviderComponent<P = {}> = <T extends CollectionItem>(props: Assign<SelectRootProviderProps<T>, P> & React.RefAttributes<HTMLDivElement>) => JSX.Element;
export declare const SelectRootProvider: SelectRootProviderComponent;
export {};
