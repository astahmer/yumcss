// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as tagsInput from '@zag-js/tags-input';
export interface UseTagsInputProps extends Optional<Omit<tagsInput.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseTagsInputReturn extends tagsInput.Api<PropTypes> {
}
export declare const useTagsInput: (props?: UseTagsInputProps) => UseTagsInputReturn;
