// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemGroupProps } from '@zag-js/menu';
import { Optional } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
type OptionalItemGroupProps = Optional<ItemGroupProps, 'id'>;
export interface MenuItemGroupBaseProps extends OptionalItemGroupProps, PolymorphicProps {
}
export interface MenuItemGroupProps extends HTMLProps<'div'>, MenuItemGroupBaseProps {
}
export declare const MenuItemGroup: ForwardRefExoticComponent<MenuItemGroupProps & RefAttributes<HTMLDivElement>>;
export {};
