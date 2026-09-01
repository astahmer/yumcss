// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseNavigationMenuProps } from './use-navigation-menu.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NavigationMenuRootBaseProps extends UseNavigationMenuProps, RenderStrategyProps, PolymorphicProps {
}
export interface NavigationMenuRootProps extends Assign<HTMLProps<'nav'>, NavigationMenuRootBaseProps> {
}
export declare const NavigationMenuRoot: ForwardRefExoticComponent<NavigationMenuRootProps & RefAttributes<HTMLElement>>;
