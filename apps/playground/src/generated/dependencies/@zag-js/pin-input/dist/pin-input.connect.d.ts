// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { PinInputSchema, PinInputApi } from './pin-input.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<PinInputSchema>, normalize: NormalizeProps<T>): PinInputApi<T>;

export { connect };
