// Generated from the workspace-linked pandwind package. Do not edit.
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseNavigationMenuReturn } from './use-navigation-menu.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseNavigationMenuReturn;
}
export interface NavigationMenuRootProviderBaseProps extends RootProviderProps, RenderStrategyProps, PolymorphicProps {
}
export interface NavigationMenuRootProviderProps extends HTMLProps<'nav'>, NavigationMenuRootProviderBaseProps {
}
export declare const NavigationMenuRootProvider: ForwardRefExoticComponent<NavigationMenuRootProviderProps & RefAttributes<HTMLElement>>;
export {};
