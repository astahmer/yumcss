// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as fileUpload from '@zag-js/file-upload';
export interface UseFileUploadProps extends Optional<Omit<fileUpload.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseFileUploadReturn extends fileUpload.Api<PropTypes> {
}
export declare const useFileUpload: (props?: UseFileUploadProps) => UseFileUploadReturn;
