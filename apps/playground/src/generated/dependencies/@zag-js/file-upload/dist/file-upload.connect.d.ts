// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { FileUploadService, FileUploadApi } from './file-upload.types.d.ts';
import '@zag-js/core';
import '@zag-js/file-utils';

declare function connect<T extends PropTypes>(service: FileUploadService, normalize: NormalizeProps<T>): FileUploadApi<T>;

export { connect };
