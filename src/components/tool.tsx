'use client';

import { memo } from 'react';
import { GlobeIcon, LoaderCircleIcon, LoaderIcon, SearchIcon } from 'lucide-react';
import { TextShimmer } from './motion-primitives/text-shimmer';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

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
                                <div className="flex flex-wrap w-full gap-6 justify-start items-center">
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

                                <div className="flex flex-wrap w-full gap-2 justify-start items-center">
                                    {results.map((res: any, index: number) => (
                                        <div
                                            key={index}
                                            className="py-1 px-2 rounded-md border bg-neutral-800"
                                        >
                                            {res.result.results.map((r: any, idx: number) => (
                                                <Link
                                                    target="_blank"
                                                    href={r.url}
                                                    key={idx}
                                                    className="truncate"
                                                >
                                                    {r.title}
                                                </Link>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full flex-row justify-between items-center gap-4">
                            <div className="flex flex-row gap-2 justify-center items-center">
                                <GlobeIcon className="size-3" />
                                <TextShimmer>Searching the Web</TextShimmer>
                            </div>
                        </div>
                    )}
                </div>
            );
        default:
            return null;
    }
});
Tool.displayName = 'Tool';
