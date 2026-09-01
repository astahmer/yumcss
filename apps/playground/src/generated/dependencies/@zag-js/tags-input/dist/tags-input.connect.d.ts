// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TagsInputSchema, TagsInputApi } from './tags-input.types.d.ts';
import '@zag-js/interact-outside';
import '@zag-js/live-region';

declare function connect<T extends PropTypes>(service: Service<TagsInputSchema>, normalize: NormalizeProps<T>): TagsInputApi<T>;

export { connect };
