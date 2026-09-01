// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import { CollectionItem, ListCollection } from '../collection/index.d.ts';
import * as select from '@zag-js/select';
export interface UseSelectProps<T extends CollectionItem> extends Optional<Omit<select.Props<T>, 'dir' | 'getRootNode' | 'collection'>, 'id'> {
    /**
     * The collection of items
     */
    collection: ListCollection<T>;
}
export interface UseSelectReturn<T extends CollectionItem> extends select.Api<PropTypes, T> {
}
export declare const useSelect: <T extends CollectionItem>(props: UseSelectProps<T>) => UseSelectReturn<T>;
