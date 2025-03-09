'use client';
import { memo } from 'react';
import { GlobeIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import { TextShimmer } from './motion-primitives/text-shimmer';
import { Separator } from './ui/separator';

interface ToolProps {
    state: 'call' | 'result' | 'partial-call';
    name: string;
    results?: any;
}

export const Tool = memo(({ state, name, results }: ToolProps) => {
    switch (name) {
        case 'web_search':
            return (
                <div className="p-4 w-full bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs">
                    {state === 'result' ? (
                        <div className="flex w-full flex-col justify-center items-center gap-4">
                            <div className="flex w-full gap-2 justify-between items-center">
                                <div className="flex justify-center items-center gap-2">
                                    <GlobeIcon className="size-3" />
                                    Web Search
                                </div>
                                <div>
                                    {results?.reduce(
                                        (total: number, query: any) =>
                                            total + (query.result?.results?.length || 0),
                                        0
                                    )}{' '}
                                    Sources
                                </div>
                            </div>
                            <Separator />
                            <div className="flex w-full flex-col gap-4 justify-center items-center">
                                <div className="flex w-full gap-6 justify-start items-center">
                                    {results.map((res: any, index: number) => (
                                        <div
                                            key={index}
                                            className="flex justify-center items-center gap-2"
                                        >
                                            <SearchIcon className="size-3" />
                                            {res.query}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex w-full gap-2 justify-start items-center">
                                    {results.map((res: any, index: number) => (
                                        <div
                                            key={index}
                                            className="py-1 px-2 rounded-md border bg-neutral-800"
                                        >
                                            {res.result.results.map((r: any, idx: number) => (
                                                <p key={idx}>{r.url}</p>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
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
