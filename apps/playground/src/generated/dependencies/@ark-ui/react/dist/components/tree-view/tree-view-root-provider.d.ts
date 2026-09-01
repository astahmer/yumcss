// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { TreeNode } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTreeViewReturn } from './use-tree-view.d.ts';
interface RootProviderProps<T extends TreeNode> {
    value: UseTreeViewReturn<T>;
}
export interface TreeViewRootProviderBaseProps<T extends TreeNode> extends RootProviderProps<T>, RenderStrategyProps, PolymorphicProps {
}
export interface TreeViewRootProviderProps<T extends TreeNode> extends HTMLProps<'div'>, TreeViewRootProviderBaseProps<T> {
}
export type TreeViewRootProviderComponent<P = {}> = <T extends TreeNode>(props: Assign<TreeViewRootProviderProps<T>, P> & React.RefAttributes<HTMLDivElement>) => JSX.Element;
export declare const TreeViewRootProvider: TreeViewRootProviderComponent;
export {};
