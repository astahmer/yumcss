// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TocSchema, TocApi } from './toc.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<TocSchema>, normalize: NormalizeProps<T>): TocApi<T>;

export { connect };
