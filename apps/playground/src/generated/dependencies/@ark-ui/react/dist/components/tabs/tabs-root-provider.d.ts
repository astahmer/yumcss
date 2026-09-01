// Generated from the workspace-linked pandwind package. Do not edit.
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTabsReturn } from './use-tabs.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseTabsReturn;
}
export interface TabsRootProviderBaseProps extends RootProviderProps, RenderStrategyProps, PolymorphicProps {
}
export interface TabsRootProviderProps extends HTMLProps<'div'>, TabsRootProviderBaseProps {
}
export declare const TabsRootProvider: ForwardRefExoticComponent<TabsRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
