// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TreeViewService, TreeViewApi } from './tree-view.types.d.ts';
import { TreeNode } from '@zag-js/collection';
import '@zag-js/core';
import '@zag-js/dom-query';

declare function connect<T extends PropTypes, V extends TreeNode = TreeNode>(service: TreeViewService<V>, normalize: NormalizeProps<T>): TreeViewApi<T, V>;

export { connect };
