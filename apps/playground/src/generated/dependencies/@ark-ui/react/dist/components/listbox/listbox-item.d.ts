// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/listbox';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ListboxItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface ListboxItemProps extends HTMLProps<'div'>, ListboxItemBaseProps {
}
export declare const ListboxItem: ForwardRefExoticComponent<ListboxItemProps & RefAttributes<HTMLDivElement>>;
