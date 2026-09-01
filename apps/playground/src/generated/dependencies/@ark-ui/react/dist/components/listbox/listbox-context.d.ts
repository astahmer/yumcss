// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { CollectionItem } from '../collection/index.d.ts';
import { UseListboxContext } from './use-listbox-context.d.ts';
export interface ListboxContextProps<T extends CollectionItem> {
    children: (context: UseListboxContext<T>) => ReactNode;
}
export declare const ListboxContext: <T extends CollectionItem>(props: ListboxContextProps<T>) => ReactNode;
