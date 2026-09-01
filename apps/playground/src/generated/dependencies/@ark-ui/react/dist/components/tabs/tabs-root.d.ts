// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTabsProps } from './use-tabs.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TabsRootBaseProps extends UseTabsProps, RenderStrategyProps, PolymorphicProps {
}
export interface TabsRootProps extends Assign<HTMLProps<'div'>, TabsRootBaseProps> {
}
export declare const TabsRoot: ForwardRefExoticComponent<TabsRootProps & RefAttributes<HTMLDivElement>>;
