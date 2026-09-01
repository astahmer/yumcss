// Generated from the workspace-linked pandwind package. Do not edit.
import { TreeNode } from '../collection/index.d.ts';
import { UseTreeViewContext } from './use-tree-view-context.d.ts';
import { ReactNode } from 'react';
export interface TreeViewContextProps<T extends TreeNode> {
    children: (context: UseTreeViewContext<T>) => React.ReactNode;
}
export declare const TreeViewContext: <T extends TreeNode>(props: TreeViewContextProps<T>) => ReactNode;
