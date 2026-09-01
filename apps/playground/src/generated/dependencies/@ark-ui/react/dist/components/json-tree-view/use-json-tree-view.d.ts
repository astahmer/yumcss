// Generated from the workspace-linked pandwind package. Do not edit.
import { JsonNode } from '@zag-js/json-tree-utils';
import { UseTreeViewProps, UseTreeViewReturn } from '../tree-view/index.d.ts';
import { JsonTreeViewOptions } from './json-tree-view-props-context.d.ts';
export interface UseJsonTreeViewProps extends Omit<UseTreeViewProps<JsonNode>, 'collection'>, JsonTreeViewOptions {
    data: unknown;
    defaultExpandedDepth?: number;
}
export interface UseJsonTreeViewReturn extends UseTreeViewReturn<JsonNode> {
    options: JsonTreeViewOptions;
}
export declare const useJsonTreeView: (props: UseJsonTreeViewProps) => UseJsonTreeViewReturn;
