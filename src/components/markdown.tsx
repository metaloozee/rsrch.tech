import { FC, memo } from 'react';
import ReactMarkdown, { Options } from 'react-markdown';
import isEqual from 'lodash/isEqual';

// Optimize the memoization comparison function to thoroughly check props
export const MemoizedReactMarkdown: FC<Options> = memo(
    ReactMarkdown,
    (prevProps: any, nextProps: any) => {
        // First check if content is the same (most important)
        if (prevProps.children !== nextProps.children) {
            return false;
        }

        // Then check if className changes
        if (prevProps.className !== nextProps.className) {
            return false;
        }

        // For components, special handling with deep equality
        if (!isEqual(prevProps.components, nextProps.components)) {
            return false;
        }

        // For plugins, assume they're equal (they're typically static)
        // This prevents unnecessary rerenders due to object identity

        // Everything important is equal, components should not rerender
        return true;
    }
);
