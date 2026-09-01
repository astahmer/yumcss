// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX, RefAttributes } from 'react';
import { Assign } from '../../types.d.ts';
import { CollectionItem } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseComboboxProps } from './use-combobox.d.ts';
export interface ComboboxRootBaseProps<T extends CollectionItem> extends UseComboboxProps<T>, UsePresenceProps, PolymorphicProps {
}
export interface ComboboxRootProps<T extends CollectionItem> extends Assign<HTMLProps<'div'>, ComboboxRootBaseProps<T>> {
}
export type ComboboxRootComponentProps<T extends CollectionItem = CollectionItem, P = {}> = Assign<ComboboxRootProps<T>, P> & RefAttributes<HTMLDivElement>;
export type ComboboxRootComponent<P = {}> = <T extends CollectionItem>(props: ComboboxRootComponentProps<T, P>) => JSX.Element;
export declare const ComboboxRoot: ComboboxRootComponent;
