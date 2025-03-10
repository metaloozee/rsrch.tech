'use client';

import { memo } from 'react';
import { GlobeIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import { TextShimmer } from './motion-primitives/text-shimmer';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/motion-primitives/accordion';
import { cn } from '@/lib/utils';

// Tool Components
export type ToolProps = {
    state: 'call' | 'result' | 'partial-call';
    name: string;
    results?: any;
    className?: string;
};

export type ToolHeaderProps = {
    icon: React.ReactNode;
    title: string;
    meta?: React.ReactNode;
    className?: string;
};

const ToolHeader = ({ icon, title, meta, className }: ToolHeaderProps) => (
    <div className={cn('flex gap-2 justify-between items-center', className)}>
        <div className="flex gap-2 justify-center items-center">
            {icon}
            {title}
        </div>
        {meta && <div>{meta}</div>}
    </div>
);

export type ToolLoadingStateProps = {
    name: string;
    className?: string;
};

const ToolLoadingState = ({ name, className }: ToolLoadingStateProps) => {
    switch (name) {
        case 'web_search':
            return (
                <div
                    className={cn(
                        'flex w-full flex-row justify-between items-center gap-4',
                        className
                    )}
                >
                    <div className="flex flex-row gap-2 justify-center items-center">
                        <GlobeIcon className="size-3" />
                        <TextShimmer>Running Web Search</TextShimmer>
                    </div>
                </div>
            );
        default:
            return (
                <div
                    className={cn(
                        'flex w-full flex-row justify-between items-center gap-4',
                        className
                    )}
                >
                    <div className="flex flex-row gap-2 justify-center items-center">
                        <LoaderCircleIcon className="size-3 animate-spin" />
                        <TextShimmer>Processing</TextShimmer>
                    </div>
                </div>
            );
    }
};

export type ToolRendererProps = {
    results?: any;
    className?: string;
};

const WebSearchRenderer = ({ results, className }: ToolRendererProps) => {
    if (!results || !Array.isArray(results)) {
        return (
            <div
                className={cn('flex w-full flex-col justify-center items-center gap-4', className)}
            >
                <ToolHeader
                    icon={<GlobeIcon className="size-3" />}
                    title="Web Search"
                    meta={<>0 Sources</>}
                    className="w-full"
                />
                <Separator />
                <div className="w-full text-center">No search results available</div>
            </div>
        );
    }

    const sourceCount = results.reduce(
        (total: number, query: any) => total + (query?.result?.results?.length || 0),
        0
    );

    return (
        <Accordion className={cn('w-full !no-underline', className)}>
            <AccordionItem value="results" className="border-none">
                <AccordionTrigger className="p-0 w-full">
                    <div className="flex w-full flex-col gap-2">
                        <ToolHeader
                            icon={<GlobeIcon className="size-3" />}
                            title="Web Search"
                            meta={<>{sourceCount} Sources</>}
                        />
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="flex w-full flex-col gap-4 justify-center items-center pt-4">
                        <Separator className="w-full" />
                        <div className="flex flex-wrap w-full gap-x-6 gap-y-3 justify-start items-center">
                            {results.map((res: any, index: number) => (
                                <div key={index} className="flex justify-center items-center gap-2">
                                    <SearchIcon className="size-3" />
                                    {res?.query || 'Unknown query'}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap w-full gap-2 justify-start items-center">
                            {results.map((res: any, index: number) => {
                                if (!res?.result?.results || !Array.isArray(res.result.results)) {
                                    return null;
                                }

                                return res.result.results.map((r: any, idx: number) => (
                                    <Link
                                        target="_blank"
                                        href={r?.url || '#'}
                                        key={`${index}-${idx}`}
                                        className="max-w-xs truncate py-1 px-2 rounded-md border bg-neutral-800"
                                    >
                                        {r?.title || 'Untitled'}
                                    </Link>
                                ));
                            })}
                        </div>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export type GenericToolRendererProps = {
    name: string;
    results?: any;
    className?: string;
};

const GenericToolRenderer = ({ name, results, className }: GenericToolRendererProps) => (
    <Accordion className={cn('w-full', className)}>
        <AccordionItem value="results" className="border-none">
            <AccordionTrigger className="p-0 w-full">
                <div className="flex w-full flex-col gap-2">
                    <ToolHeader icon={<LoaderCircleIcon className="size-3" />} title={name} />
                </div>
            </AccordionTrigger>
            <AccordionContent>
                <div className="flex w-full flex-col gap-4 justify-center items-center pt-4">
                    <Separator className="w-full" />
                    <div className="w-full">
                        <pre className="text-xs overflow-x-auto">
                            {results ? JSON.stringify(results, null, 2) : 'No results available'}
                        </pre>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    </Accordion>
);

export const Tool = memo(({ state, name, results, className }: ToolProps) => {
    return (
        <div
            className={cn(
                'p-4 !w-full bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                className
            )}
        >
            {state === 'result' ? (
                (() => {
                    switch (name) {
                        case 'web_search':
                            return <WebSearchRenderer results={results} />;
                        default:
                            return <GenericToolRenderer name={name} results={results} />;
                    }
                })()
            ) : (
                <ToolLoadingState name={name} />
            )}
        </div>
    );
});

Tool.displayName = 'Tool';

export { ToolHeader, ToolLoadingState };
