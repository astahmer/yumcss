// Generated from the workspace-linked pandwind package. Do not edit.
import { JsonNode } from '@zag-js/json-tree-utils';
import { TreeView } from '../tree-view/index.d.ts';
import { UseJsonTreeViewReturn } from './use-json-tree-view.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface JsonTreeViewRootProviderProps extends Omit<TreeView.RootProviderProps<JsonNode>, 'value'> {
    value: UseJsonTreeViewReturn;
}
export declare const JsonTreeViewRootProvider: ForwardRefExoticComponent<JsonTreeViewRootProviderProps & RefAttributes<HTMLDivElement>>;
