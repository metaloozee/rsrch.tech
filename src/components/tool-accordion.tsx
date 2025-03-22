'use client';

import { memo, useState } from 'react';
import { GlobeIcon, ListIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import { TextShimmer } from '@/components/motion-primitives/text-shimmer';
import { cn } from '@/lib/utils';

export type ToolData = {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args: any;
    result?: any;
};

export type ResearchGoal = {
    goal: string;
    analysis: string;
};

export type ToolAccordionProps = {
    tools: ToolData[];
    className?: string;
};

export const ToolAccordion = memo(({ tools, className }: ToolAccordionProps) => {
    const researchPlanTools = tools.filter((t) => t.toolName === 'research_plan_generator');
    const webSearchTools = tools.filter((t) => t.toolName === 'web_search');
    const otherTools = tools.filter(
        (t) => t.toolName !== 'research_plan_generator' && t.toolName !== 'web_search'
    );

    const isResearchPlanLoading = researchPlanTools.some((t) => t.state === 'call');
    const isWebSearchLoading = webSearchTools.some((t) => t.state === 'call');
    const allToolsComplete = tools.every((t) => t.state === 'result');

    const researchPlanResult = researchPlanTools.find((t) => t.state === 'result')?.result;
    const webSearchResults = webSearchTools
        .filter((t) => t.state === 'result')
        .map((t) => t.result);

    let goals: ResearchGoal[] = [];
    if (researchPlanResult) {
        try {
            let parsedData = researchPlanResult;
            if (typeof researchPlanResult === 'string') {
                try {
                    parsedData = JSON.parse(researchPlanResult);
                } catch (e) {
                    console.error('Error parsing research plan result string:', e);
                }
            }

            if (Array.isArray(parsedData)) {
                goals = parsedData;
            } else if (parsedData.goals && Array.isArray(parsedData.goals)) {
                goals = parsedData.goals;
            } else if (parsedData.goal) {
                goals = [parsedData];
            }
        } catch (e) {
            console.error('Error processing research goals:', e);
        }
    }

    const searchResultsByGoal: Record<string, any[]> = {};
    webSearchResults.forEach((result) => {
        if (!result) return;

        try {
            let parsedResult = result;
            if (typeof result === 'string') {
                try {
                    parsedResult = JSON.parse(result);
                } catch (e) {
                    console.error('Error parsing web search result string:', e);
                    return;
                }
            }

            console.log('Parsed web search result:', parsedResult);

            if (parsedResult.goal && parsedResult.search_results) {
                const goalText = parsedResult.goal;
                if (!searchResultsByGoal[goalText]) {
                    searchResultsByGoal[goalText] = [];
                }

                const searchRes = Array.isArray(parsedResult.search_results)
                    ? parsedResult.search_results
                    : [parsedResult.search_results];

                searchResultsByGoal[goalText].push(...searchRes);
            } else if (Array.isArray(parsedResult)) {
                const defaultGoal = goals.length > 0 ? goals[0].goal : 'General Research';

                if (!searchResultsByGoal[defaultGoal]) {
                    searchResultsByGoal[defaultGoal] = [];
                }

                searchResultsByGoal[defaultGoal].push(...parsedResult);
            } else if (parsedResult.query) {
                let targetGoal = 'General Research';
                if (goals.length > 0) {
                    targetGoal = goals[0].goal;
                }

                if (!searchResultsByGoal[targetGoal]) {
                    searchResultsByGoal[targetGoal] = [];
                }

                searchResultsByGoal[targetGoal].push(parsedResult);
            }
        } catch (e) {
            console.error('Error processing web search results:', e);
        }
    });

    const totalSources = Object.values(searchResultsByGoal).reduce((acc, results) => {
        return (
            acc +
            results.reduce((total, query) => {
                if (query?.result?.results && Array.isArray(query.result.results)) {
                    return total + query.result.results.length;
                } else if (query?.results && Array.isArray(query.results)) {
                    return total + query.results.length;
                } else if (Array.isArray(query)) {
                    return total + query.length;
                }
                return total + 1;
            }, 0)
        );
    }, 0);

    const totalQueries = Object.values(searchResultsByGoal).reduce(
        (acc, results) => acc + results.length,
        0
    );

    console.log({
        goals,
        searchResultsByGoal,
        totalSources,
        totalQueries,
    });

    if (isResearchPlanLoading && isWebSearchLoading) {
        return (
            <div
                className={cn(
                    'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs p-4',
                    className
                )}
            >
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                        <LoaderCircleIcon className="size-3 animate-spin" />
                        <TextShimmer>Processing Research</TextShimmer>
                    </div>
                    <div className="text-xs opacity-70">Initializing...</div>
                </div>
            </div>
        );
    }

    if (isResearchPlanLoading) {
        return (
            <div
                className={cn(
                    'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs p-4',
                    className
                )}
            >
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
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
                    'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs p-4',
                    className
                )}
            >
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                        <GlobeIcon className="size-3" />
                        <TextShimmer>Searching Web for Information</TextShimmer>
                    </div>
                    <div className="text-xs opacity-70">Step 2 of 2</div>
                </div>
            </div>
        );
    }

    if (goals.length === 0) {
        return (
            <div
                className={cn(
                    'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs p-4',
                    className
                )}
            >
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ListIcon className="size-3" />
                        <span className="font-medium">Research</span>
                    </div>
                    <div className="text-xs opacity-70">No results</div>
                </div>
                <div className="mt-3 text-center py-2 border-t border-neutral-800">
                    No research goals found
                </div>
            </div>
        );
    }

    return (
        <Accordion
            className={cn(
                'bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                className
            )}
        >
            <AccordionItem value="research" className="border-none">
                <AccordionTrigger className="p-4 cursor-pointer w-full">
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2 items-center">
                            <ListIcon className="size-3" />
                            <span className="font-medium">Research</span>
                        </div>
                        <div className="flex flex-shrink-0 gap-2 text-xs opacity-80 ml-auto">
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
                <AccordionContent className="p-4">
                    <div className="space-y-6">
                        {goals.map((goal, idx) => {
                            const goalText = goal.goal;
                            const searchResultsForGoal = searchResultsByGoal[goalText] || [];

                            const sourceCount = searchResultsForGoal.reduce((total, query) => {
                                if (query?.result?.results && Array.isArray(query.result.results)) {
                                    return total + query.result.results.length;
                                } else if (query?.results && Array.isArray(query.results)) {
                                    return total + query.results.length;
                                } else if (Array.isArray(query)) {
                                    return total + query.length;
                                }
                                return total + 1;
                            }, 0);

                            return (
                                <div key={`goal-${idx}`} className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium">{goalText}</div>
                                    </div>

                                    <div className="w-full flex flex-col gap-3">
                                        {searchResultsForGoal.length > 0 && (
                                            <>
                                                <div className="w-full">
                                                    <div className="text-xs font-medium mb-2">
                                                        Search Queries
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {searchResultsForGoal.map(
                                                            (result, resultIdx) => (
                                                                <div
                                                                    key={`query-${idx}-${resultIdx}`}
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
                                                    <div className="w-full">
                                                        <div className="text-xs font-medium mb-2">
                                                            Sources
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                const sources = searchResultsForGoal
                                                                    .flatMap((res) => {
                                                                        if (res?.result?.results) {
                                                                            return res.result
                                                                                .results;
                                                                        } else if (res?.results) {
                                                                            return res.results;
                                                                        } else if (
                                                                            Array.isArray(res)
                                                                        ) {
                                                                            return res;
                                                                        }
                                                                        return [];
                                                                    })
                                                                    .filter(Boolean);

                                                                console.log(
                                                                    `Sources for goal "${goalText}":`,
                                                                    sources
                                                                );

                                                                const domainMap: Record<
                                                                    string,
                                                                    {
                                                                        count: number;
                                                                        url: string;
                                                                        title: string;
                                                                    }
                                                                > = {};

                                                                sources.forEach((source) => {
                                                                    try {
                                                                        const sourceUrl =
                                                                            source?.url ||
                                                                            source?.link ||
                                                                            '#';
                                                                        const domain = new URL(
                                                                            sourceUrl
                                                                        ).hostname.replace(
                                                                            'www.',
                                                                            ''
                                                                        );

                                                                        if (!domainMap[domain]) {
                                                                            domainMap[domain] = {
                                                                                count: 0,
                                                                                url: sourceUrl,
                                                                                title:
                                                                                    source?.title ||
                                                                                    source?.name ||
                                                                                    'Unknown',
                                                                            };
                                                                        }
                                                                        domainMap[domain].count++;
                                                                    } catch (e) {
                                                                        console.error(
                                                                            'Error processing source:',
                                                                            source,
                                                                            e
                                                                        );
                                                                        if (!domainMap['unknown']) {
                                                                            domainMap['unknown'] = {
                                                                                count: 0,
                                                                                url: '#',
                                                                                title: 'Unknown',
                                                                            };
                                                                        }
                                                                        domainMap['unknown']
                                                                            .count++;
                                                                    }
                                                                });

                                                                if (
                                                                    Object.keys(domainMap)
                                                                        .length === 0 &&
                                                                    sources.length > 0
                                                                ) {
                                                                    return (
                                                                        <div className="text-xs opacity-70 p-2">
                                                                            {sources.length} sources
                                                                            available (unable to
                                                                            extract domains)
                                                                        </div>
                                                                    );
                                                                }

                                                                return Object.entries(
                                                                    domainMap
                                                                ).map(
                                                                    ([domain, info], domainIdx) => (
                                                                        <Link
                                                                            target="_blank"
                                                                            href={info.url}
                                                                            key={`domain-${idx}-${domainIdx}`}
                                                                            className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                                                        >
                                                                            <span className="text-xs font-medium">
                                                                                {domain}
                                                                            </span>
                                                                            {info.count > 1 && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700">
                                                                                    {info.count}
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
                                    {idx < goals.length - 1 && <Separator className="my-4" />}
                                </div>
                            );
                        })}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
});

ToolAccordion.displayName = 'ToolAccordion';
