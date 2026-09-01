// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX, RefAttributes } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseComboboxReturn } from './use-combobox.d.ts';
interface RootProviderProps<T extends CollectionItem> {
    value: UseComboboxReturn<T>;
}
export interface ComboboxRootProviderBaseProps<T extends CollectionItem> extends RootProviderProps<T>, UsePresenceProps, PolymorphicProps {
}
export interface ComboboxRootProviderProps<T extends CollectionItem> extends HTMLProps<'div'>, ComboboxRootProviderBaseProps<T> {
}
export type ComboboxRootProviderComponent<P = {}> = <T extends CollectionItem>(props: Assign<ComboboxRootProviderProps<T>, P> & RefAttributes<HTMLDivElement>) => JSX.Element;
export declare const ComboboxRootProvider: ComboboxRootProviderComponent;
export {};
