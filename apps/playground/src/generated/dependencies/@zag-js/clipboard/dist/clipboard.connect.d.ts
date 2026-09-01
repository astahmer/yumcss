// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { ClipboardService, ClipboardApi } from './clipboard.types.d.ts';
import '@zag-js/core';

declare function connect<T extends PropTypes>(service: ClipboardService, normalize: NormalizeProps<T>): ClipboardApi<T>;

export { connect };
