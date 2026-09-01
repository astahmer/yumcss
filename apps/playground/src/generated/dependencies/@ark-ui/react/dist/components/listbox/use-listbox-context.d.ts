// Generated from the workspace-linked pandwind package. Do not edit.
import { CollectionItem } from '../collection/index.d.ts';
import { UseListboxReturn } from './use-listbox.d.ts';
import { Provider } from 'react';
export interface UseListboxContext<T extends CollectionItem> extends UseListboxReturn<T> {
}
export declare const ListboxProvider: Provider<UseListboxContext<any>>, useListboxContext: () => UseListboxContext<any>;
