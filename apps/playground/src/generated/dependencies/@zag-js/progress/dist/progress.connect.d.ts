// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { ProgressService, ProgressApi } from './progress.types.d.ts';
import '@zag-js/core';

declare function connect<T extends PropTypes>(service: ProgressService, normalize: NormalizeProps<T>): ProgressApi<T>;

export { connect };
