// Generated from the workspace-linked pandwind package. Do not edit.
import { CollectionItem } from '../collection/index.d.ts';
import { UseComboboxReturn } from './use-combobox.d.ts';
import { Provider } from 'react';
export interface UseComboboxContext<T extends CollectionItem> extends UseComboboxReturn<T> {
}
export declare const ComboboxProvider: Provider<UseComboboxContext<any>>, useComboboxContext: () => UseComboboxContext<any>;
