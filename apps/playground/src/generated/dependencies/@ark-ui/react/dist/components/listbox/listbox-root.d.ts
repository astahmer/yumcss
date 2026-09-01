// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseListboxProps } from './use-listbox.d.ts';
export interface ListboxRootBaseProps<T extends CollectionItem> extends UseListboxProps<T>, PolymorphicProps {
}
export interface ListboxRootProps<T extends CollectionItem> extends Assign<HTMLProps<'div'>, ListboxRootBaseProps<T>> {
}
export type ListboxRootComponentProps<T extends CollectionItem = CollectionItem, P = {}> = Assign<ListboxRootProps<T>, P> & React.RefAttributes<HTMLDivElement>;
export type ListboxRootComponent<P = {}> = <T extends CollectionItem>(props: ListboxRootComponentProps<T, P>) => JSX.Element;
export declare const ListboxRoot: ListboxRootComponent;
