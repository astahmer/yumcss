// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { CollectionItem } from '../collection/index.d.ts';
import { UseComboboxContext } from './use-combobox-context.d.ts';
export interface ComboboxContextProps<T extends CollectionItem> {
    children: (context: UseComboboxContext<T>) => ReactNode;
}
export declare const ComboboxContext: <T extends CollectionItem>(props: ComboboxContextProps<T>) => ReactNode;
