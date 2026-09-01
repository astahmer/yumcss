// Generated from the workspace-linked pandwind package. Do not edit.
import { CollectionItem } from '../collection/index.d.ts';
import { UseSelectReturn } from './use-select.d.ts';
import { Provider } from 'react';
export interface UseSelectContext<T extends CollectionItem> extends UseSelectReturn<T> {
}
export declare const SelectProvider: Provider<UseSelectContext<any>>, useSelectContext: () => UseSelectContext<any>;
