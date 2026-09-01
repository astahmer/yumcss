// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as pagination from '@zag-js/pagination';
export interface UsePaginationProps extends Optional<Omit<pagination.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UsePaginationReturn extends pagination.Api<PropTypes> {
}
export declare const usePagination: (props?: UsePaginationProps) => UsePaginationReturn;
