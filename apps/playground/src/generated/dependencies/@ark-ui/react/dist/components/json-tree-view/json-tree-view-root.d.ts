// Generated from the workspace-linked pandwind package. Do not edit.
import { JsonNode } from '@zag-js/json-tree-utils';
import { TreeView } from '../tree-view/index.d.ts';
import { JsonTreeViewOptions } from './json-tree-view-props-context.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface JsonTreeViewRootProps extends Omit<TreeView.RootProps<JsonNode>, 'collection'>, JsonTreeViewOptions {
    /**
     * The data to display in the tree.
     */
    data: unknown;
    /**
     * The default expand level.
     */
    defaultExpandedDepth?: number;
}
export declare const JsonTreeViewRoot: ForwardRefExoticComponent<JsonTreeViewRootProps & RefAttributes<HTMLDivElement>>;
