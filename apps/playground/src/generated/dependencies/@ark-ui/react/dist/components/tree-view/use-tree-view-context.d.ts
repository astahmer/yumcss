// Generated from the workspace-linked pandwind package. Do not edit.
import { TreeNode } from '../collection/index.d.ts';
import { UseTreeViewReturn } from './use-tree-view.d.ts';
import { Provider } from 'react';
export interface UseTreeViewContext<T extends TreeNode> extends UseTreeViewReturn<T> {
}
export declare const TreeViewProvider: Provider<UseTreeViewContext<any>>, useTreeViewContext: () => UseTreeViewContext<any>;
