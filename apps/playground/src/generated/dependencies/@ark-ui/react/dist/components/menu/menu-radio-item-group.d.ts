// Generated from the workspace-linked pandwind package. Do not edit.
import { Optional } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseMenuItemGroupContext } from './use-menu-item-group-context.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
type OptionalUseMenuItemGroupContext = Optional<UseMenuItemGroupContext, 'id'>;
export interface MenuRadioItemGroupBaseProps extends OptionalUseMenuItemGroupContext, PolymorphicProps {
}
export interface MenuRadioItemGroupProps extends HTMLProps<'div'>, MenuRadioItemGroupBaseProps {
}
export declare const MenuRadioItemGroup: ForwardRefExoticComponent<MenuRadioItemGroupProps & RefAttributes<HTMLDivElement>>;
export {};
