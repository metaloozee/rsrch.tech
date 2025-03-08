import { FC, memo } from 'react';
import ReactMarkdown, { Options } from 'react-markdown';

export const MemoizedReactMarkdown: FC<Options> = memo(
    ReactMarkdown,
    (prevProps: any, nextProps: any) =>
        prevProps.children === nextProps.children && prevProps.className === nextProps.className
);
