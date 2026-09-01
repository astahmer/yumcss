// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { EditableSchema, EditableApi } from './editable.types.d.ts';
import '@zag-js/interact-outside';

declare function connect<T extends PropTypes>(service: Service<EditableSchema>, normalize: NormalizeProps<T>): EditableApi<T>;

export { connect };
