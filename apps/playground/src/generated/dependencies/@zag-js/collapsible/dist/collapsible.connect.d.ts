// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { CollapsibleSchema, CollapsibleApi } from './collapsible.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<CollapsibleSchema>, normalize: NormalizeProps<T>): CollapsibleApi<T>;

export { connect };
