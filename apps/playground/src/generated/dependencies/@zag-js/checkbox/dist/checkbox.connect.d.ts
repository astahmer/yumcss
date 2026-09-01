// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { Service } from '@zag-js/core';
import { CheckboxSchema, CheckboxApi } from './checkbox.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<CheckboxSchema>, normalize: NormalizeProps<T>): CheckboxApi<T>;

export { connect };
