'use client';

import { memo, useMemo, useState } from 'react';
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

export type ResearchGoal = {
    goal: string;
    analysis: string;
};

export type ToolProps = {
    state: 'call' | 'result' | 'partial-call';
    name: string;
    results?: any;
    className?: string;
    allToolResults?: {
        research_plan_generator?: ResearchGoal[];
        web_search?: any[];
    };
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

export type UnifiedResearchRendererProps = {
    goals: ResearchGoal[];
    searchResults: any[];
    className?: string;
};

const UnifiedResearchRenderer = ({
    goals,
    searchResults,
    className,
}: UnifiedResearchRendererProps) => {
    const sourceCount =
        searchResults?.reduce(
            (total: number, query: any) => total + (query?.result?.results?.length || 0),
            0
        ) || 0;

    const searchQueries = searchResults?.map((r) => r.query) || [];

    return (
        <Accordion className={cn('w-full !no-underline', className)}>
            <AccordionItem value="results" className="border-none">
                <AccordionTrigger className="p-0 w-full cursor-pointer">
                    <div className="flex w-full flex-row justify-between items-center">
                        <div className="flex gap-2 justify-center items-center">
                            <ListIcon className="size-3" />
                            <span>Research Plan</span>
                        </div>
                        <div className="flex gap-2 text-xs opacity-80">
                            <span>
                                {goals.length} goal{goals.length !== 1 ? 's' : ''}
                            </span>
                            <span>•</span>
                            <span>
                                {searchQueries.length} quer
                                {searchQueries.length !== 1 ? 'ies' : 'y'}
                            </span>
                            <span>•</span>
                            <span>
                                {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <Separator className="w-full my-4" />
                    <div className="flex w-full flex-col gap-6">
                        {goals.map((goal, goalIndex) => {
                            // Improved keyword extraction to better match queries with goals
                            const keywords = goal.goal
                                .toLowerCase()
                                .split(/\s+/)
                                .filter(
                                    (word) =>
                                        word.length > 3 &&
                                        ![
                                            'what',
                                            'when',
                                            'where',
                                            'which',
                                            'who',
                                            'how',
                                            'why',
                                            'the',
                                            'and',
                                            'with',
                                            'that',
                                            'this',
                                            'for',
                                            'you',
                                            'are',
                                            'can',
                                            'about',
                                        ].includes(word)
                                );

                            const goalWords = goal.goal.toLowerCase().split(/\s+/);
                            const importantPhrases: string[] = [];

                            for (let i = 0; i < goalWords.length - 1; i++) {
                                if (goalWords[i].length > 3 && goalWords[i + 1].length > 3) {
                                    importantPhrases.push(`${goalWords[i]} ${goalWords[i + 1]}`);

                                    if (i < goalWords.length - 2 && goalWords[i + 2].length > 3) {
                                        importantPhrases.push(
                                            `${goalWords[i]} ${goalWords[i + 1]} ${goalWords[i + 2]}`
                                        );
                                    }
                                }
                            }

                            const relatedQueries =
                                searchResults?.filter((result) => {
                                    if (!result.query) return false;

                                    const query = result.query.toLowerCase();
                                    const goalText = goal.goal.toLowerCase();

                                    if (query.includes(goalText) || goalText.includes(query)) {
                                        return true;
                                    }

                                    for (const phrase of importantPhrases) {
                                        if (query.includes(phrase)) return true;
                                    }

                                    const matchingKeywords = keywords.filter((keyword) =>
                                        query.includes(keyword)
                                    );

                                    return matchingKeywords.length > 0;
                                }) || [];

                            const allDomainSources = relatedQueries
                                .flatMap((res: any) => res?.result?.results || [])
                                .filter(Boolean)
                                .map((r: any) => {
                                    try {
                                        return {
                                            domain: new URL(r?.url || '#').hostname.replace(
                                                'www.',
                                                ''
                                            ),
                                            url: r?.url || '#',
                                            title: r?.title || 'Unknown',
                                        };
                                    } catch {
                                        return { domain: 'unknown', url: '#', title: 'Unknown' };
                                    }
                                });

                            const domainCounts = allDomainSources.reduce(
                                (acc: { [key: string]: number }, item) => {
                                    acc[item.domain] = (acc[item.domain] || 0) + 1;
                                    return acc;
                                },
                                {}
                            );

                            const domains = Object.entries(domainCounts).map(([domain, count]) => {
                                const firstSource = allDomainSources.find(
                                    (item) => item.domain === domain
                                );
                                return {
                                    domain,
                                    count,
                                    url: firstSource?.url || '#',
                                    title: firstSource?.title || 'Unknown',
                                };
                            });

                            return (
                                <div key={goalIndex} className="flex flex-col gap-1 w-full">
                                    <div className="font-medium text-sm">{goal.goal}</div>
                                    {/* {goal.analysis && (
                                        <div className="mt-1">
                                            <Accordion className="w-full">
                                                <AccordionItem value="analysis" className="border-none">
                                                    <AccordionTrigger className="py-0 px-0 text-[10px] opacity-70 hover:opacity-100 text-left font-medium">
                                                        View Analysis
                                                    </AccordionTrigger>
                                                    <AccordionContent className="pt-1 pb-0">
                                                        <div className="text-[10px] text-neutral-500">{goal.analysis}</div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        </div>
                                    )} */}

                                    <div
                                        className={cn(
                                            'ml-4 flex flex-col gap-3 border-l border-neutral-800 pl-4 mt-2',
                                            relatedQueries.length === 0 && 'opacity-70'
                                        )}
                                    >
                                        <div className="text-xs text-neutral-500 font-medium">
                                            {relatedQueries.length > 0
                                                ? 'Search Queries'
                                                : 'No matching search queries'}
                                        </div>

                                        {relatedQueries.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {relatedQueries.map((query, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                                    >
                                                        <SearchIcon className="size-3 text-neutral-400" />
                                                        <span className="text-xs">
                                                            {query.query}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs">
                                                No search queries were specifically matched to this
                                                research goal
                                            </div>
                                        )}

                                        {domains.length > 0 && (
                                            <div className="mt-2">
                                                <div className="text-xs text-neutral-500 font-medium">
                                                    Sources
                                                </div>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {domains.map((domain, index) => (
                                                        <Link
                                                            key={index}
                                                            href={domain.url}
                                                            target="_blank"
                                                            className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                                            title={domain.title}
                                                        >
                                                            <span className="text-xs font-medium">
                                                                {domain.domain}
                                                            </span>
                                                            {domain.count > 1 && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700">
                                                                    {domain.count}
                                                                </span>
                                                            )}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {goalIndex < goals.length - 1 && (
                                        <Separator className="w-full my-3" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

// Keep the original WebSearchRenderer for backward compatibility
const WebSearchRenderer = ({ results, className }: { results?: any; className?: string }) => {
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

    const allSources = results.flatMap((res: any) => res?.result?.results || []).filter(Boolean);

    const domainMap = allSources.reduce(
        (acc: { [key: string]: { count: number; url: string; title: string } }, source: any) => {
            try {
                const domain = new URL(source?.url || '#').hostname.replace('www.', '');
                if (!acc[domain]) {
                    acc[domain] = {
                        count: 0,
                        url: source?.url || '#',
                        title: source?.title || 'Unknown',
                    };
                }
                acc[domain].count++;
                return acc;
            } catch {
                if (!acc['unknown']) {
                    acc['unknown'] = { count: 0, url: '#', title: 'Unknown' };
                }
                acc['unknown'].count++;
                return acc;
            }
        },
        {}
    );

    const allDomains = Object.keys(domainMap);

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
                                    {results.map((res: any) => (
                                        <div
                                            key={res.query}
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
                                    const domainInfo = domainMap[domain];
                                    const url = domainInfo.url;
                                    const domainCount = domainInfo.count;

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
                                .filter(Boolean)
                                .slice(0, 6);

                            if (allImages.length === 0) return null;

                            const [availableImages, setAvailableImages] = useState<Set<string>>(
                                new Set()
                            );
                            const [unavailableImages, setUnavailableImages] = useState<Set<string>>(
                                new Set()
                            );

                            const displayImages = allImages.filter(
                                (img: any) => !unavailableImages.has(img?.url)
                            );

                            const remainingCount = Math.max(
                                0,
                                allImages.length - displayImages.length
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
                                                            setUnavailableImages((prev) => {
                                                                const newSet = new Set(prev);
                                                                newSet.add(imageUrl);
                                                                return newSet;
                                                            });
                                                        }}
                                                        onLoad={() => {
                                                            setAvailableImages((prev) => {
                                                                const newSet = new Set(prev);
                                                                newSet.add(imageUrl);
                                                                return newSet;
                                                            });
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

const ResearchPlanRenderer = ({ results, className }: { results?: any; className?: string }) => {
    let parsedResults;
    let goals: ResearchGoal[] = [];

    try {
        if (typeof results === 'string') {
            parsedResults = JSON.parse(results);
            if (parsedResults.plan && Array.isArray(parsedResults.plan.goals)) {
                goals = parsedResults.plan.goals;
            } else if (parsedResults && Array.isArray(parsedResults.goals)) {
                goals = parsedResults.goals;
            } else if (Array.isArray(parsedResults)) {
                goals = parsedResults;
            }
        } else if (results && typeof results === 'object') {
            if (results.plan && Array.isArray(results.plan.goals)) {
                goals = results.plan.goals;
            } else if (Array.isArray(results)) {
                goals = results;
            } else if (results.goals && Array.isArray(results.goals)) {
                goals = results.goals;
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
                    title="Research Plan"
                    meta={<>0</>}
                    className="w-full"
                />
                <Separator />
                <div className="w-full text-center">No research goals found</div>
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
                            title="Research Plan"
                            meta={<>{goalCount}</>}
                        />
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="flex w-full flex-col gap-4 justify-center items-center pt-4">
                        <Separator className="w-full" />
                        <div className="flex flex-col w-full gap-2">
                            <ul className="list-disc pl-6 space-y-2">
                                {goals.map((goal, index) => (
                                    <li key={index} className="text-xs">
                                        {goal.goal}
                                    </li>
                                ))}
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

export const Tool = memo(({ state, name, results, className, allToolResults }: ToolProps) => {
    if (
        state === 'result' &&
        allToolResults?.research_plan_generator &&
        allToolResults?.web_search &&
        (name === 'research_plan_generator' || name === 'web_search')
    ) {
        return (
            <div
                className={cn(
                    '!w-full bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs',
                    className
                )}
            >
                <UnifiedResearchRenderer
                    goals={allToolResults.research_plan_generator}
                    searchResults={allToolResults.web_search}
                />
            </div>
        );
    }

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
