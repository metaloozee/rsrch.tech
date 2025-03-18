'use client';

import { memo, useState } from 'react';
import { GlobeIcon, LoaderCircleIcon, SearchIcon, ListIcon } from 'lucide-react';
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
        case 'research_plan_generator':
            return (
                <div
                    className={cn(
                        'flex w-full flex-row justify-between items-center gap-4',
                        className
                    )}
                >
                    <div className="flex flex-row gap-2 justify-center items-center">
                        <ListIcon className="size-3" />
                        <TextShimmer>Generating Research Plan</TextShimmer>
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

    const allDomains = results
        .flatMap((res: any) => res?.result?.results || [])
        .filter(Boolean)
        .map((r: any) => {
            try {
                return new URL(r?.url || '#').hostname.replace('www.', '');
            } catch {
                return 'unknown';
            }
        })
        .filter((domain: string, index: number, self: string[]) => self.indexOf(domain) === index);

    return (
        <Accordion className={cn('w-full !no-underline', className)}>
            <AccordionItem value="results" className="border-none">
                <AccordionTrigger className="p-0 w-full cursor-pointer">
                    <div className="flex w-full flex-col gap-2">
                        <ToolHeader
                            icon={<GlobeIcon className="size-3" />}
                            title="Web Search"
                            meta={
                                <div className="flex gap-1 items-center">
                                    <span className="text-xs">{sourceCount}</span>
                                    <span className="text-xs opacity-70">
                                        {sourceCount === 1 ? 'source' : 'sources'}
                                    </span>
                                </div>
                            }
                        />
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="flex w-full flex-col gap-4 justify-center items-center pt-4">
                        <Separator className="w-full" />

                        {results.length > 0 && (
                            <div className="w-full">
                                <div className="text-xs font-medium mb-2">Search Queries</div>
                                <div className="flex flex-wrap w-full gap-x-3 gap-y-2 justify-start items-center">
                                    {results.map((res: any, index: number) => (
                                        <div
                                            key={index}
                                            className="flex justify-center items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                        >
                                            <SearchIcon className="size-3 text-neutral-400" />
                                            <span className="text-xs">
                                                {res?.query || 'Unknown query'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="w-full">
                            <div className="text-xs font-medium mb-2">Sources</div>
                            <div className="flex flex-wrap w-full gap-2 justify-start items-center">
                                {allDomains.map((domain: string, idx: number) => {
                                    // Find a URL for this domain
                                    const sourceItem = results
                                        .flatMap((res: any) => res?.result?.results || [])
                                        .find((r: any) => {
                                            try {
                                                return (
                                                    new URL(r?.url || '#').hostname.replace(
                                                        'www.',
                                                        ''
                                                    ) === domain
                                                );
                                            } catch {
                                                return false;
                                            }
                                        });

                                    const url = sourceItem?.url || '#';

                                    const domainCount = results
                                        .flatMap((res: any) => res?.result?.results || [])
                                        .filter((r: any) => {
                                            try {
                                                return (
                                                    new URL(r?.url || '#').hostname.replace(
                                                        'www.',
                                                        ''
                                                    ) === domain
                                                );
                                            } catch {
                                                return false;
                                            }
                                        }).length;

                                    return (
                                        <Link
                                            target="_blank"
                                            href={url}
                                            key={idx}
                                            className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                        >
                                            <span className="text-xs font-medium">{domain}</span>
                                            {domainCount > 1 && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700">
                                                    {domainCount}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}

                                {sourceCount > allDomains.length && (
                                    <span className="py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 text-xs">
                                        + {sourceCount - allDomains.length} more
                                    </span>
                                )}
                            </div>
                        </div>

                        {(() => {
                            const allImages = results
                                .flatMap((res: any) => res?.result?.images || [])
                                .filter(Boolean);

                            if (allImages.length === 0) return null;

                            const [availableImages, setAvailableImages] = useState<{
                                [key: string]: boolean;
                            }>({});

                            const displayImages = allImages
                                .slice(0, 6)
                                .filter((img: any) => availableImages[img?.url] !== false);

                            const remainingCount = Math.max(
                                0,
                                allImages.length -
                                    (Object.values(availableImages).filter((v) => v === false)
                                        .length +
                                        displayImages.length)
                            );

                            if (displayImages.length === 0 && remainingCount === 0) return null;

                            return (
                                <div className="w-full">
                                    <div className="text-xs font-medium mb-2">Images</div>
                                    <div className="flex flex-wrap w-full gap-3 justify-start items-center">
                                        {displayImages.map((img: any, idx: number) => {
                                            const imageUrl = img?.url || '#';
                                            const sourceUrl = img?.source_url || imageUrl;

                                            return (
                                                <Link
                                                    target="_blank"
                                                    href={sourceUrl}
                                                    key={idx}
                                                    className="relative w-36 aspect-[16/9] overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 hover:opacity-90 transition-opacity group"
                                                >
                                                    <img
                                                        src={imageUrl}
                                                        alt={img?.alt_text || 'Search result image'}
                                                        className="absolute top-0 left-0 h-full w-full object-cover"
                                                        loading="lazy"
                                                        onError={() => {
                                                            setAvailableImages((prev) => ({
                                                                ...prev,
                                                                [imageUrl]: false,
                                                            }));
                                                        }}
                                                        onLoad={() => {
                                                            setAvailableImages((prev) => ({
                                                                ...prev,
                                                                [imageUrl]: true,
                                                            }));
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                                                        <div className="p-2 text-[10px] truncate w-full">
                                                            {img?.alt_text || 'View image'}
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                        {remainingCount > 0 && (
                                            <span className="py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 text-xs">
                                                + {remainingCount} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

const ResearchPlanRenderer = ({ results, className }: ToolRendererProps) => {
    let parsedResults;
    let goals = [];

    try {
        if (typeof results === 'string') {
            parsedResults = JSON.parse(results);
            if (parsedResults.plan && Array.isArray(parsedResults.plan.goals)) {
                goals = parsedResults.plan.goals;
            } else if (parsedResults && Array.isArray(parsedResults.goals)) {
                goals = parsedResults.goals;
            }
        } else if (results && typeof results === 'object') {
            if (results.plan && Array.isArray(results.plan.goals)) {
                goals = results.plan.goals;
            } else if (Array.isArray(results)) {
                goals = results;
            }
        }
    } catch (e) {
        console.error('Error parsing research plan results:', e);
    }

    const goalCount = goals.length;

    if (goalCount === 0) {
        return (
            <div
                className={cn('flex w-full flex-col justify-center items-center gap-4', className)}
            >
                <ToolHeader
                    icon={<ListIcon className="size-3" />}
                    title="Search Goals"
                    meta={<>0</>}
                    className="w-full"
                />
                <Separator />
                <div className="w-full text-center">No Search Goals found</div>
            </div>
        );
    }

    return (
        <Accordion className={cn('w-full !no-underline', className)}>
            <AccordionItem value="results" className="border-none">
                <AccordionTrigger className="p-0 w-full cursor-pointer">
                    <div className="flex w-full flex-col gap-2">
                        <ToolHeader
                            icon={<ListIcon className="size-3" />}
                            title="Search Goals"
                            meta={<>{goalCount}</>}
                        />
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="flex w-full flex-col gap-4 justify-center items-center pt-4">
                        <Separator className="w-full" />
                        <div className="flex flex-col w-full gap-2">
                            <ul className="list-disc pl-6 space-y-2">
                                {goals.map(
                                    (goal: { goal: string; analysis: string }, index: number) => (
                                        <li key={index} className="text-xs">
                                            {goal.goal}
                                        </li>
                                    )
                                )}
                            </ul>
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
                        case 'research_plan_generator':
                            return <ResearchPlanRenderer results={results} />;
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
