'use client';
import { memo } from 'react';
import { TextLoop } from '@/components/motion-primitives/text-loop';
import { GlobeIcon, LoaderCircleIcon } from 'lucide-react';
import { TextShimmer } from './motion-primitives/text-shimmer';

interface ToolProps {
    state: 'call' | 'result' | 'partial-call';
    name: string;
    results?: any;
}

export const Tool = memo(({ state, name, results }: ToolProps) => {
    switch (name) {
        case 'web_search':
            return (
                <div className="py-2 px-4 bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs">
                    {state === 'result' ? (
                        <span className="flex gap-2 justify-center items-center">
                            <GlobeIcon className="size-3" />
                            {results?.reduce(
                                (total: number, query: any) =>
                                    total + (query.result?.results?.length || 0),
                                0
                            )}{' '}
                            Sources
                        </span>
                    ) : (
                        <span className="flex gap-2 justify-center items-center">
                            <LoaderCircleIcon className="animate-spin size-3" />
                            <TextShimmer>Searching the Web</TextShimmer>
                        </span>
                    )}
                </div>
            );
        default:
            return null;
    }
});
Tool.displayName = 'Tool';
