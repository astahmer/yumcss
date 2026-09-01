// Generated from the workspace-linked pandwind package. Do not edit.
import { JSX } from 'react';
import { Assign } from '../../types.d.ts';
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { TreeNode } from '../collection/index.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTreeViewProps } from './use-tree-view.d.ts';
export interface TreeViewRootBaseProps<T extends TreeNode> extends UseTreeViewProps<T>, RenderStrategyProps, PolymorphicProps {
}
export interface TreeViewRootProps<T extends TreeNode> extends HTMLProps<'div'>, TreeViewRootBaseProps<T> {
}
export type TreeViewRootComponentProps<T extends TreeNode = TreeNode, P = {}> = Assign<TreeViewRootProps<T>, P> & React.RefAttributes<HTMLDivElement>;
export type TreeViewRootComponent<P = {}> = <T extends TreeNode>(props: TreeViewRootComponentProps<T, P>) => JSX.Element;
export declare const TreeViewRoot: TreeViewRootComponent;
