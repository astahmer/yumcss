// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseSelectProps } from './use-select.d.ts';
export interface SelectRootBaseProps<T extends CollectionItem> extends UseSelectProps<T>, UsePresenceProps, PolymorphicProps {
}
export interface SelectRootProps<T extends CollectionItem> extends Assign<HTMLProps<'div'>, SelectRootBaseProps<T>> {
}
export type SelectRootComponentProps<T extends CollectionItem = CollectionItem, P = {}> = Assign<SelectRootProps<T>, P> & React.RefAttributes<HTMLDivElement>;
export type SelectRootComponent<P = {}> = <T extends CollectionItem>(props: SelectRootComponentProps<T, P>) => JSX.Element;
export declare const SelectRoot: SelectRootComponent;
