// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as imageCropper from '@zag-js/image-cropper';
export interface UseImageCropperProps extends Optional<Omit<imageCropper.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseImageCropperReturn extends imageCropper.Api<PropTypes> {
}
export declare const useImageCropper: (props?: UseImageCropperProps) => UseImageCropperReturn;
