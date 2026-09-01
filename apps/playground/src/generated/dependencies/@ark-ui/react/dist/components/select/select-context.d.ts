// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { CollectionItem } from '../collection/index.d.ts';
import { UseSelectContext } from './use-select-context.d.ts';
export interface SelectContextProps<T extends CollectionItem> {
    children: (context: UseSelectContext<T>) => ReactNode;
}
export declare const SelectContext: <T extends CollectionItem>(props: SelectContextProps<T>) => ReactNode;
