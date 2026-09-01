// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/navigation-menu';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NavigationMenuItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface NavigationMenuItemProps extends HTMLProps<'div'>, NavigationMenuItemBaseProps {
}
export declare const NavigationMenuItem: ForwardRefExoticComponent<NavigationMenuItemProps & RefAttributes<HTMLDivElement>>;
