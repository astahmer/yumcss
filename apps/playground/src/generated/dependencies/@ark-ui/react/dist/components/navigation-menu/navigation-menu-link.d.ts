// Generated from the workspace-linked pandwind package. Do not edit.
import { LinkProps } from '@zag-js/navigation-menu';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NavigationMenuLinkBaseProps extends Partial<LinkProps>, PolymorphicProps {
}
export interface NavigationMenuLinkProps extends Assign<HTMLProps<'a'>, NavigationMenuLinkBaseProps> {
}
export declare const NavigationMenuLink: ForwardRefExoticComponent<NavigationMenuLinkProps & RefAttributes<HTMLAnchorElement>>;
