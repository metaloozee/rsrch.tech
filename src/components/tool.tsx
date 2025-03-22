'use client';

/**
 * @deprecated Use UnifiedToolDisplay component instead
 */

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
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

export type ResearchGoal = {
    goal: string;
    analysis: string;
};

export type ToolProps = {
    state: 'call' | 'result';
    name: string;
    args: any;
    result?: any;
    className?: string;
    debug?: boolean;
};

export type ToolHeaderProps = {
    icon: React.ReactNode;
    title: string;
    meta?: React.ReactNode;
    className?: string;
};

const ToolHeader = memo(({ icon, title, meta, className }: ToolHeaderProps) => (
    <div className={cn('flex gap-2 justify-between items-center', className)}>
        <div className="flex gap-2 justify-center items-center">
            {icon}
            {title}
        </div>
        {meta && <div>{meta}</div>}
    </div>
));

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

export type UnifiedResearchProps = {
    title?: string;
    tools: any[];
    renderNestedResults?: boolean;
    className?: string;
};

export const UnifiedResearchRenderer = memo(
    ({
        title = 'Research',
        tools,
        renderNestedResults = true,
        className,
    }: UnifiedResearchProps) => {
        const researchPlanTools = tools.filter((t) => t.toolName === 'research_plan_generator');
        const webSearchTools = tools.filter((t) => t.toolName === 'web_search');

        const isResearchPlanLoading = researchPlanTools.some((t) => t.state === 'call');
        const isWebSearchLoading = webSearchTools.some((t) => t.state === 'call');

        if (isResearchPlanLoading && isWebSearchLoading) {
            return (
                <div
                    className={cn(
                        'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                        className
                    )}
                >
                    <div className="p-4 flex w-full justify-between items-center">
                        <div className="flex gap-2 items-center">
                            <ListIcon className="size-3" />
                            <TextShimmer>Generating Research Plan</TextShimmer>
                        </div>
                        <div className="flex items-center text-xs opacity-70">
                            <LoaderCircleIcon className="size-3 animate-spin mr-2" />
                            Processing...
                        </div>
                    </div>
                </div>
            );
        }

        if (isResearchPlanLoading) {
            return (
                <div
                    className={cn(
                        'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                        className
                    )}
                >
                    <div className="p-4 flex w-full justify-between items-center">
                        <div className="flex gap-2 items-center">
                            <ListIcon className="size-3" />
                            <TextShimmer>Generating Research Plan</TextShimmer>
                        </div>
                        <div className="text-xs opacity-70">Step 1 of 2</div>
                    </div>
                </div>
            );
        }

        if (isWebSearchLoading) {
            return (
                <div
                    className={cn(
                        'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                        className
                    )}
                >
                    <div className="p-4 flex w-full justify-between items-center">
                        <div className="flex gap-2 items-center">
                            <GlobeIcon className="size-3" />
                            <TextShimmer>Searching Web for Information</TextShimmer>
                        </div>
                        <div className="text-xs opacity-70">Step 2 of 2</div>
                    </div>
                </div>
            );
        }

        let goals: ResearchGoal[] = [];
        let searchResultsByGoal: Record<string, any[]> = {};

        const researchPlanResultTool = researchPlanTools.find((t) => t.state === 'result');
        if (researchPlanResultTool && researchPlanResultTool.result) {
            let parsedGoals;
            try {
                if (typeof researchPlanResultTool.result === 'string') {
                    const parsed = JSON.parse(researchPlanResultTool.result);
                    parsedGoals = parsed.goals || parsed;
                } else {
                    parsedGoals =
                        researchPlanResultTool.result.goals || researchPlanResultTool.result;
                }

                if (Array.isArray(parsedGoals)) {
                    goals = parsedGoals;
                }
            } catch (e) {
                console.error('Error parsing research plan goals:', e);
            }
        }

        const webSearchResultTools = webSearchTools.filter((t) => t.state === 'result');
        for (const webSearchResultTool of webSearchResultTools) {
            if (webSearchResultTool && webSearchResultTool.result) {
                try {
                    let searchResults;
                    if (typeof webSearchResultTool.result === 'string') {
                        searchResults = JSON.parse(webSearchResultTool.result);
                    } else {
                        searchResults = webSearchResultTool.result;
                    }

                    if (searchResults.goal && searchResults.search_results) {
                        const goalText = searchResults.goal;
                        if (!searchResultsByGoal[goalText]) {
                            searchResultsByGoal[goalText] = [];
                        }

                        if (Array.isArray(searchResults.search_results)) {
                            searchResultsByGoal[goalText].push(...searchResults.search_results);
                        } else {
                            searchResultsByGoal[goalText].push(searchResults.search_results);
                        }
                    } else if (Array.isArray(searchResults)) {
                        for (const result of searchResults) {
                            const goalText = result.goal || '';
                            if (goalText) {
                                if (!searchResultsByGoal[goalText]) {
                                    searchResultsByGoal[goalText] = [];
                                }
                                searchResultsByGoal[goalText].push(result);
                            } else {
                                const targetGoal =
                                    goals.length > 0 ? goals[0].goal : 'uncategorized';
                                if (!searchResultsByGoal[targetGoal]) {
                                    searchResultsByGoal[targetGoal] = [];
                                }
                                searchResultsByGoal[targetGoal].push(result);
                            }
                        }
                    } else if (searchResults.query) {
                        const targetGoal = goals.length === 1 ? goals[0].goal : 'uncategorized';
                        if (!searchResultsByGoal[targetGoal]) {
                            searchResultsByGoal[targetGoal] = [];
                        }
                        searchResultsByGoal[targetGoal].push(searchResults);
                    }
                } catch (e) {
                    console.error('Error parsing web search results:', e);
                }
            }
        }

        if (goals.length === 0) {
            return (
                <div
                    className={cn(
                        'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs p-4',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        <ListIcon className="size-3" />
                        <span className="font-medium">{title}</span>
                    </div>
                    <div className="mt-3 text-center py-2">No research goals found</div>
                </div>
            );
        }

        const totalSources = Object.values(searchResultsByGoal).reduce((acc, results) => {
            return (
                acc +
                results.reduce((total, query) => {
                    return total + (query?.result?.results?.length || 0);
                }, 0)
            );
        }, 0);

        const totalQueries = Object.values(searchResultsByGoal).reduce(
            (acc, results) => acc + results.length,
            0
        );

        return (
            <Accordion
                className={cn(
                    'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                    className
                )}
            >
                <AccordionItem value="research" className="border-none">
                    <AccordionTrigger className="p-4 cursor-pointer">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2 justify-center items-center">
                                <ListIcon className="size-3" />
                                <span className="font-medium">{title}</span>
                            </div>
                            <div className="flex gap-2 text-xs opacity-80">
                                <span>
                                    {goals.length} goal{goals.length !== 1 ? 's' : ''}
                                </span>
                                <span>•</span>
                                <span>
                                    {totalQueries} quer{totalQueries !== 1 ? 'ies' : 'y'}
                                </span>
                                <span>•</span>
                                <span>
                                    {totalSources} source{totalSources !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="space-y-6">
                            {goals.map((goal, idx) => {
                                const goalText = goal.goal;
                                const searchResultsForGoal = searchResultsByGoal[goalText] || [];

                                const sourceCount = searchResultsForGoal.reduce((total, query) => {
                                    return total + (query?.result?.results?.length || 0);
                                }, 0);

                                return (
                                    <div key={`goal-${idx}`} className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="font-medium">{goalText}</div>
                                        </div>

                                        <div className="h-full w-full flex flex-row justify-start items-center gap-5">
                                            <div className="flex flex-col gap-2">
                                                {searchResultsForGoal.length > 0 && (
                                                    <>
                                                        <div className="border-neutral-700">
                                                            <div className="text-xs font-medium mb-2">
                                                                Search Queries
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {searchResultsForGoal.map(
                                                                    (result, resultIdx) => (
                                                                        <div
                                                                            key={`result-${idx}-${resultIdx}`}
                                                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                                                        >
                                                                            <SearchIcon className="size-3 text-neutral-400" />
                                                                            <span className="text-xs">
                                                                                {result.query ||
                                                                                    'Unknown query'}
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>

                                                        {sourceCount > 0 && (
                                                            <div className="border-neutral-700">
                                                                <div className="text-xs font-medium mb-2">
                                                                    Sources
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(() => {
                                                                        const sources =
                                                                            searchResultsForGoal
                                                                                .flatMap(
                                                                                    (res) =>
                                                                                        res?.result
                                                                                            ?.results ||
                                                                                        []
                                                                                )
                                                                                .filter(Boolean);

                                                                        const domainMap: Record<
                                                                            string,
                                                                            {
                                                                                count: number;
                                                                                url: string;
                                                                                title: string;
                                                                            }
                                                                        > = {};
                                                                        sources.forEach(
                                                                            (source) => {
                                                                                try {
                                                                                    const domain =
                                                                                        new URL(
                                                                                            source?.url ||
                                                                                                '#'
                                                                                        ).hostname.replace(
                                                                                            'www.',
                                                                                            ''
                                                                                        );
                                                                                    if (
                                                                                        !domainMap[
                                                                                            domain
                                                                                        ]
                                                                                    ) {
                                                                                        domainMap[
                                                                                            domain
                                                                                        ] = {
                                                                                            count: 0,
                                                                                            url:
                                                                                                source?.url ||
                                                                                                '#',
                                                                                            title:
                                                                                                source?.title ||
                                                                                                'Unknown',
                                                                                        };
                                                                                    }
                                                                                    domainMap[
                                                                                        domain
                                                                                    ].count++;
                                                                                } catch {
                                                                                    if (
                                                                                        !domainMap[
                                                                                            'unknown'
                                                                                        ]
                                                                                    ) {
                                                                                        domainMap[
                                                                                            'unknown'
                                                                                        ] = {
                                                                                            count: 0,
                                                                                            url: '#',
                                                                                            title: 'Unknown',
                                                                                        };
                                                                                    }
                                                                                    domainMap[
                                                                                        'unknown'
                                                                                    ].count++;
                                                                                }
                                                                            }
                                                                        );

                                                                        return Object.entries(
                                                                            domainMap
                                                                        ).map(
                                                                            (
                                                                                [domain, info],
                                                                                domainIdx
                                                                            ) => (
                                                                                <Link
                                                                                    target="_blank"
                                                                                    href={info.url}
                                                                                    key={`domain-${idx}-${domainIdx}`}
                                                                                    className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                                                                >
                                                                                    <span className="text-xs font-medium">
                                                                                        {domain}
                                                                                    </span>
                                                                                    {info.count >
                                                                                        1 && (
                                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700">
                                                                                            {
                                                                                                info.count
                                                                                            }
                                                                                        </span>
                                                                                    )}
                                                                                </Link>
                                                                            )
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {idx < goals.length - 1 && <Separator className="my-4" />}
                                    </div>
                                );
                            })}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }
);

UnifiedResearchRenderer.displayName = 'UnifiedResearchRenderer';

export const Tool = memo(({ state, name, args, result, className, debug = false }: ToolProps) => {
    let parsedResult = result;
    if (typeof result === 'string') {
        try {
            parsedResult = JSON.parse(result);
        } catch (e) {
            console.error('Error parsing tool result:', e);
        }
    }

    const toolData = [
        {
            toolName: name,
            state: state,
            args: args,
            result: parsedResult,
        },
    ];

    return (
        <div
            className={cn(
                'p-4 !w-full bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                className
            )}
        >
            {state === 'call' ? (
                <ToolLoadingState name={name} />
            ) : (
                <UnifiedResearchRenderer tools={toolData} />
            )}
        </div>
    );
});

Tool.displayName = 'Tool';

export { ToolHeader, ToolLoadingState };
