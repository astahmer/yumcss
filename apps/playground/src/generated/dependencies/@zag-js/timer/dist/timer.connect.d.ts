// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TimerSchema, TimerApi } from './timer.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<TimerSchema>, normalize: NormalizeProps<T>): TimerApi<T>;

export { connect };
