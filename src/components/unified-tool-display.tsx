'use client';

import {
    ChartArea,
    ListIcon,
    Loader2Icon,
    LoaderCircleIcon,
    LoaderIcon,
    MapIcon,
    ScrollText,
    SearchIcon,
    ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/ui/disclosure';
import { Message } from 'ai';

export type ToolData = {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args: any;
    result?: any;
};

export type ResearchStep = {
    id: string;
    type: string;
    state: 'processing' | 'complete';
    content: string;
    data?: any;
};

export type ResearchGoal = {
    goal: string;
    analysis?: string;
    search_queries?: string[];
};

export type UnifiedToolDisplayProps = {
    message: Message;
    className?: string;
};

function extractToolData(message: Message): ToolData[] {
    console.log('Extracting tool data from message:', message);

    const toolData: ToolData[] = [];

    if (message.role === 'assistant' && message.parts) {
        message.parts.forEach((part) => {
            if (part.type === 'tool-invocation' && part.toolInvocation) {
                const { toolCallId, state, toolName, args } = part.toolInvocation;
                const result = (part.toolInvocation as any).result;

                if (toolName === 'web_search') {
                    toolData.push({
                        toolCallId,
                        toolName,
                        state: state as 'call' | 'result',
                        args,
                        result: {
                            goal: args?.plan?.goal,
                            search_results: Array.isArray(result) ? result : [result],
                            total_search_queries:
                                args?.total_search_queries ||
                                (part.toolInvocation as any)?.total_search_queries,
                        },
                    });
                } else {
                    toolData.push({
                        toolCallId,
                        toolName,
                        state: state as 'call' | 'result',
                        args,
                        result,
                    });
                }
            } else if ((part as any).type === 'tool-call') {
                const typedPart = part as any;
                if (typedPart.data) {
                    const { toolCallId, toolName, state, args, result } = typedPart.data;

                    toolData.push({
                        toolCallId: toolCallId || 'unknown-id',
                        toolName: toolName || 'unknown-tool',
                        state: (state as 'call' | 'result') || 'call',
                        args: parseJsonIfString(args),
                        result: parseJsonIfString(result),
                    });
                }
            } else if (typeof part === 'object' && part !== null) {
                const maybeToolData = extractToolDataFromPart(part);
                if (maybeToolData) {
                    toolData.push(maybeToolData);
                }
            }
        });
    }

    if (message.role === 'assistant' && (message as any).annotations) {
        const annotations = (message as any).annotations || [];

        annotations.forEach((annotation: any) => {
            if (annotation.type === 'tool-call') {
                if (annotation.data) {
                    const { toolCallId, toolName, state, args, result } = annotation.data;
                    toolData.push({
                        toolCallId: toolCallId || 'unknown-id',
                        toolName: toolName || 'unknown-tool',
                        state: (state as 'call' | 'result') || 'call',
                        args: parseJsonIfString(args),
                        result: parseJsonIfString(result),
                    });
                }
            }
        });
    }

    if (message.role === 'assistant' && (message as any).tool) {
        const tool = (message as any).tool;

        if (typeof tool === 'object' && tool !== null) {
            toolData.push({
                toolCallId: tool.id || tool.toolCallId || 'direct-tool',
                toolName: tool.name || tool.toolName || 'unknown-tool',
                state: tool.state || 'result',
                args: parseJsonIfString(tool.args || tool.input),
                result: parseJsonIfString(tool.result || tool.output),
            });
        } else if (Array.isArray(tool)) {
            tool.forEach((t: any) => {
                if (typeof t === 'object' && t !== null) {
                    toolData.push({
                        toolCallId: t.id || t.toolCallId || `direct-tool-${toolData.length}`,
                        toolName: t.name || t.toolName || 'unknown-tool',
                        state: t.state || 'result',
                        args: parseJsonIfString(t.args || t.input),
                        result: parseJsonIfString(t.result || t.output),
                    });
                }
            });
        }
    }

    const toolMap = new Map<string, ToolData>();
    toolData.forEach((tool) => {
        const existing = toolMap.get(tool.toolCallId);
        if (!existing || tool.state === 'result') {
            toolMap.set(tool.toolCallId, tool);
        }
    });

    const result = Array.from(toolMap.values());
    return result;
}

function extractResearchSteps(message: Message): {
    [key: string]: { call: boolean; result: boolean; data?: any };
} {
    const steps: { [key: string]: { call: boolean; result: boolean; data?: any } } = {
        plan: { call: false, result: false },
        search: { call: false, result: false },
        analysis: { call: false, result: false },
        report: { call: false, result: false },
    };

    if (message.role === 'assistant' && (message as any).annotations) {
        const annotations = (message as any).annotations || [];

        annotations.forEach((annotation: any) => {
            if (annotation.type && annotation.state) {
                const type = annotation.type;
                if (steps[type]) {
                    if (annotation.state === 'call' || annotation.state === 'partial-call') {
                        steps[type].call = true;
                        steps[type].data = annotation;
                    } else if (annotation.state === 'result') {
                        steps[type].result = true;
                        steps[type].data = annotation;
                    }
                }
            }
        });
    }

    return steps;
}

function parseJsonIfString(value: any): any {
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch (e) {
        console.error('Failed to parse JSON:', e);
        return value;
    }
}

function extractToolDataFromPart(part: any): ToolData | null {
    if (part.type === 'tool-call' || part.type === 'tool_call') {
        return {
            toolCallId: part.tool?.id || part.data?.toolCallId || 'sdk-tool-id',
            toolName: part.tool?.name || part.data?.toolName || 'sdk-tool',
            state: part.data?.state || 'result',
            args: parseJsonIfString(part.tool?.input || part.data?.args),
            result: parseJsonIfString(part.tool?.output || part.data?.result),
        };
    }

    if (part.data && part.data.toolName && part.data.toolCallId) {
        return {
            toolCallId: part.data.toolCallId,
            toolName: part.data.toolName,
            state: part.data.state as 'call' | 'result',
            args: parseJsonIfString(part.data.args),
            result: parseJsonIfString(part.data.result),
        };
    }

    if (part.tool) {
        return {
            toolCallId: part.tool.id || 'unknown-id',
            toolName: part.tool.name || 'unknown-tool',
            state: 'call',
            args: parseJsonIfString(part.tool.input),
            result: null,
        };
    }

    return null;
}

export const UnifiedToolDisplay = ({ message, className }: UnifiedToolDisplayProps) => {
    const tools = extractToolData(message);
    const steps = extractResearchSteps(message);

    const hasAnnotations = (message as any).annotations && (message as any).annotations.length > 0;
    const hasResearchAnnotations =
        hasAnnotations &&
        (message as any).annotations.some((a: any) =>
            ['plan', 'search', 'analysis', 'report'].includes(a.type)
        );

    if (hasResearchAnnotations || Object.values(steps).some((step) => step.call || step.result)) {
        return renderResearchWorkflow(message);
    }

    if (!tools || tools.length === 0) {
        return null;
    }

    return renderResearch(tools);
};

function renderResearchWorkflow(message: Message) {
    const steps = extractResearchSteps(message);

    const isPlanning = steps.plan.call && !steps.plan.result;
    const isSearching = steps.search.call && !steps.search.result;
    const isAnalyzing = steps.analysis.call && !steps.analysis.result;
    const isGeneratingFinal = steps.report.call && !steps.report.result;

    const goalCount = steps.plan.data?.count || 0;
    const searchCount = steps.search.data?.count || 0;

    const researchGoals = steps.plan.data?.data || [];

    const goalSearchMap = new Map();
    const goalAnalysisMap = new Map();

    const searchAnnotations = ((message as any).annotations || []).filter(
        (a: any) => a.type === 'search' && a.state === 'result'
    );

    const analysisAnnotations = ((message as any).annotations || []).filter(
        (a: any) => a.type === 'analysis' && a.state === 'result'
    );

    analysisAnnotations.forEach((annotation: any) => {
        if (annotation.goal) {
            goalAnalysisMap.set(annotation.goal, annotation.data);
        }
    });

    if (goalAnalysisMap.size === 0 && steps.analysis.data?.data) {
        const analysisText = steps.analysis.data.data;
        researchGoals.forEach((goal: any) => {
            if (analysisText.includes(goal.goal)) {
                goalAnalysisMap.set(goal.goal, analysisText);
            }
        });

        if (goalAnalysisMap.size === 0 && researchGoals.length > 0) {
            goalAnalysisMap.set('general', analysisText);
        }
    }

    searchAnnotations.forEach((annotation: any) => {
        const goal = annotation.goal;
        const queries = annotation.queries || [];
        const results = annotation.results || [];

        if (!goalSearchMap.has(goal)) {
            goalSearchMap.set(goal, {
                goal,
                queries,
                results,
                domainMap: {},
            });
        } else {
            const existing = goalSearchMap.get(goal);
            existing.queries = [...new Set([...existing.queries, ...queries])];
            existing.results = [...existing.results, ...results];
        }

        const domainMap = goalSearchMap.get(goal).domainMap;
        results.forEach((result: any) => {
            if (result && result.result && result.result.results) {
                result.result.results.forEach((source: any) => {
                    try {
                        if (source && source.url) {
                            const sourceUrl = source.url;
                            const domain = new URL(sourceUrl).hostname.replace('www.', '');

                            if (!domainMap[domain]) {
                                domainMap[domain] = {
                                    count: 0,
                                    url: sourceUrl,
                                    title: source.title || domain,
                                };
                            }
                            domainMap[domain].count++;
                        }
                    } catch (e) {
                        console.error('Error processing URL:', e);
                        if (!domainMap['unknown']) {
                            domainMap['unknown'] = { count: 0, url: '#', title: 'Unknown Source' };
                        }
                        domainMap['unknown'].count++;
                    }
                });
            }
        });
    });

    return (
        <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
            <Accordion className="w-full">
                <AccordionItem value="research-workflow">
                    <AccordionTrigger className="p-4 cursor-pointer w-full">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2 items-center">
                                <MapIcon className="size-3" />
                                <span className="font-medium">Research Workflow</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs opacity-80">
                                {isPlanning || isSearching || isAnalyzing || isGeneratingFinal ? (
                                    <>
                                        <LoaderCircleIcon className="size-3 animate-spin" />
                                        <span>Research in progress...</span>
                                    </>
                                ) : (
                                    <span>Research completed</span>
                                )}
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-neutral-950/50">
                        <div className="space-y-4 p-4">
                            {/* Planning Section */}
                            <div className="flex flex-col space-y-2 border-b border-neutral-800 pb-4">
                                <div className="flex w-full justify-between items-center">
                                    <div className="flex gap-2 items-center">
                                        <ListIcon className="size-3" />
                                        <span className="font-medium">Research Plan</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs opacity-80">
                                        {isPlanning ? (
                                            <div className="inline-flex justify-center items-center gap-2 px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-[10px]">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                IN PROGRESS
                                            </div>
                                        ) : steps.plan.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                {goalCount} {goalCount === 1 ? 'GOAL' : 'GOALS'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                PENDING
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Search Section */}
                            <div className="flex flex-col space-y-2 border-b border-neutral-800 pb-4">
                                <div className="flex w-full justify-between items-center">
                                    <div className="flex gap-2 items-center">
                                        <SearchIcon className="size-3" />
                                        <span className="font-medium">Web Search</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs opacity-80">
                                        {isSearching ? (
                                            <div className="inline-flex justify-center items-center gap-2 px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-[10px]">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                IN PROGRESS
                                            </div>
                                        ) : steps.search.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                {/* Get total queries directly from the global annotation */}
                                                {steps.plan.data?.total_search_queries ||
                                                    steps.search.data?.total_search_queries ||
                                                    researchGoals?.reduce(
                                                        (total: number, goal: ResearchGoal) =>
                                                            total +
                                                            (goal.search_queries?.length || 0),
                                                        0
                                                    ) ||
                                                    searchCount}{' '}
                                                {(steps.plan.data?.total_search_queries ||
                                                    steps.search.data?.total_search_queries ||
                                                    researchGoals?.reduce(
                                                        (total: number, goal: ResearchGoal) =>
                                                            total +
                                                            (goal.search_queries?.length || 0),
                                                        0
                                                    ) ||
                                                    searchCount) === 1
                                                    ? 'SEARCH'
                                                    : 'SEARCHES'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                PENDING
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isSearching ? (
                                    <div className="flex items-center gap-2 text-xs p-2">
                                        <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
                                        <p className="text-xs text-muted-foreground">
                                            Searching the web for:{' '}
                                            {steps.search.data?.query || 'relevant information...'}
                                        </p>
                                    </div>
                                ) : steps.search.result ? (
                                    <div className="text-xs text-neutral-400 py-2 space-y-4">
                                        {/* Display goals and their search results */}
                                        {researchGoals.length > 0 && (
                                            <div className="space-y-3">
                                                {researchGoals.map((goal: any, index: number) => {
                                                    const goalData = goalSearchMap.get(
                                                        goal.goal
                                                    ) || {
                                                        queries: goal.search_queries || [],
                                                        domainMap: {},
                                                    };

                                                    return (
                                                        <div
                                                            key={index}
                                                            className="border border-neutral-800 rounded-md"
                                                        >
                                                            <Disclosure>
                                                                <DisclosureTrigger>
                                                                    <div className="flex gap-2 flex-wrap items-center justify-between p-3 w-full cursor-pointer hover:bg-neutral-800/30 transition-colors">
                                                                        <div className="font-medium md:max-w-lg">
                                                                            {goal.goal}
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                                                            {goalData.queries
                                                                                .length > 0 && (
                                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800">
                                                                                    {
                                                                                        goalData
                                                                                            .queries
                                                                                            .length
                                                                                    }{' '}
                                                                                    {goalData
                                                                                        .queries
                                                                                        .length ===
                                                                                    1
                                                                                        ? 'query'
                                                                                        : 'queries'}
                                                                                </span>
                                                                            )}
                                                                            {Object.keys(
                                                                                goalData.domainMap
                                                                            ).length > 0 && (
                                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800">
                                                                                    {
                                                                                        Object.keys(
                                                                                            goalData.domainMap
                                                                                        ).length
                                                                                    }{' '}
                                                                                    {Object.keys(
                                                                                        goalData.domainMap
                                                                                    ).length === 1
                                                                                        ? 'source'
                                                                                        : 'sources'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </DisclosureTrigger>
                                                                <DisclosureContent>
                                                                    <div className="px-3 pb-3 pt-1 space-y-3">
                                                                        {/* Search Queries for this goal */}
                                                                        {goalData.queries.length >
                                                                            0 && (
                                                                            <div className="space-y-1">
                                                                                <div className="text-[11px] font-medium text-neutral-400">
                                                                                    Search Queries
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {goalData.queries.map(
                                                                                        (
                                                                                            query: string,
                                                                                            qIndex: number
                                                                                        ) => (
                                                                                            <div
                                                                                                key={
                                                                                                    qIndex
                                                                                                }
                                                                                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                                                                            >
                                                                                                <SearchIcon className="size-2 text-neutral-400" />
                                                                                                <span className="text-[11px]">
                                                                                                    {
                                                                                                        query
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Sources/Domains for this goal */}
                                                                        {Object.keys(
                                                                            goalData.domainMap
                                                                        ).length > 0 && (
                                                                            <div className="space-y-1">
                                                                                <div className="text-[11px] font-medium text-neutral-400">
                                                                                    Sources
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {Object.entries(
                                                                                        goalData.domainMap
                                                                                    )
                                                                                        .sort(
                                                                                            (
                                                                                                a: [
                                                                                                    string,
                                                                                                    any,
                                                                                                ],
                                                                                                b: [
                                                                                                    string,
                                                                                                    any,
                                                                                                ]
                                                                                            ) =>
                                                                                                b[1]
                                                                                                    .count -
                                                                                                a[1]
                                                                                                    .count
                                                                                        )
                                                                                        .map(
                                                                                            (
                                                                                                [
                                                                                                    domain,
                                                                                                    info,
                                                                                                ]: [
                                                                                                    string,
                                                                                                    any,
                                                                                                ],
                                                                                                idx: number
                                                                                            ) => (
                                                                                                <Link
                                                                                                    key={
                                                                                                        idx
                                                                                                    }
                                                                                                    target="_blank"
                                                                                                    href={
                                                                                                        info.url
                                                                                                    }
                                                                                                    className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                                                                                >
                                                                                                    <img
                                                                                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                                                                                        width={
                                                                                                            12
                                                                                                        }
                                                                                                        height={
                                                                                                            12
                                                                                                        }
                                                                                                        className="rounded-sm"
                                                                                                        alt=""
                                                                                                    />
                                                                                                    <span className="text-[11px] font-medium truncate">
                                                                                                        {
                                                                                                            domain
                                                                                                        }
                                                                                                    </span>
                                                                                                    {info.count >
                                                                                                        1 && (
                                                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700 flex-shrink-0">
                                                                                                            {
                                                                                                                info.count
                                                                                                            }
                                                                                                        </span>
                                                                                                    )}
                                                                                                </Link>
                                                                                            )
                                                                                        )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </DisclosureContent>
                                                            </Disclosure>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground p-2">
                                        Search phase will begin after planning
                                    </div>
                                )}
                            </div>

                            {/* Analysis Section */}
                            <div className="flex flex-col space-y-2 border-b border-neutral-800 pb-4">
                                <div className="flex w-full justify-between items-center">
                                    <div className="flex gap-2 items-center">
                                        <ChartArea className="size-3" />
                                        <span className="font-medium">Analysis</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs opacity-80">
                                        {isAnalyzing ? (
                                            <div className="inline-flex justify-center items-center gap-2 px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-[10px]">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                IN PROGRESS
                                            </div>
                                        ) : steps.analysis.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                COMPLETED
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                PENDING
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Report Generation Section */}
                            <div className="flex flex-col space-y-2">
                                <div className="flex w-full justify-between items-center">
                                    <div className="flex gap-2 items-center">
                                        <ScrollText className="size-3" />
                                        <span className="font-medium">Report Generation</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs opacity-80">
                                        {isGeneratingFinal ? (
                                            <div className="inline-flex justify-center items-center gap-2 px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-[10px]">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                IN PROGRESS
                                            </div>
                                        ) : steps.report.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                COMPLETED
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                PENDING
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}

function renderResearch(tools: ToolData[]) {
    const searchTools = tools.filter((tool) => tool.toolName === 'web_search');

    if (searchTools.length === 0) {
        return null;
    }

    const resultTools = searchTools.filter((tool) => tool.state === 'result' && tool.result);
    const isLoading = searchTools.some((tool) => tool.state === 'call');

    const totalSearchQueriesFromTools =
        resultTools.length > 0 ? resultTools[0]?.result?.total_search_queries : undefined;

    if (isLoading || resultTools.length === 0) {
        return (
            <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
                <Accordion className="w-full">
                    <AccordionItem value="research" className="border-none">
                        <AccordionTrigger className="p-4 cursor-pointer w-full">
                            <div className="flex w-full justify-between items-center">
                                <div className="flex gap-2 items-center">
                                    <ListIcon className="size-3" />
                                    <span className="font-medium">Research</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs opacity-80">
                                    <LoaderCircleIcon className="size-3 animate-spin" />
                                    <span>
                                        {isLoading ? 'Searching...' : 'Processing results...'}
                                    </span>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="flex flex-col items-center justify-center p-4 gap-2">
                                <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">
                                    {isLoading
                                        ? 'Searching the web for relevant information...'
                                        : 'Processing search results...'}
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        );
    }

    try {
        const allGoals: {
            goal: string;
            queries: string[];
            sources: any[];
            domainMap: Record<string, { count: number; url: string; title: string }>;
        }[] = [];

        for (const resultTool of resultTools) {
            const { goal, search_results } = resultTool.result;

            if (!goal || !search_results || !Array.isArray(search_results)) {
                continue;
            }

            const queries = search_results.map((sr) => sr.query);
            const sources = search_results
                .filter((sr) => sr.result && sr.result.results)
                .flatMap((sr) => sr.result.results)
                .filter(Boolean);

            const domainMap: Record<string, { count: number; url: string; title: string }> = {};
            sources.forEach((source) => {
                try {
                    const sourceUrl = source?.url || '#';
                    const domain = new URL(sourceUrl).hostname.replace('www.', '');

                    if (!domainMap[domain]) {
                        domainMap[domain] = {
                            count: 0,
                            url: sourceUrl,
                            title: source?.title || domain,
                        };
                    }
                    domainMap[domain].count++;
                } catch (e) {
                    console.error('Error processing URL:', e);
                    if (!domainMap['unknown']) {
                        domainMap['unknown'] = {
                            count: 0,
                            url: '#',
                            title: 'Unknown Source',
                        };
                    }
                    domainMap['unknown'].count++;
                }
            });

            allGoals.push({
                goal,
                queries,
                sources,
                domainMap,
            });
        }

        const totalGoals = allGoals.length;

        const totalQueries =
            totalSearchQueriesFromTools ||
            allGoals.reduce((sum, goal) => {
                return sum + goal.queries.length;
            }, 0);

        const allSourcesSet = new Set<string>();
        allGoals.forEach((goal) => {
            goal.sources.forEach((source) => {
                if (source.result && source.result.results) {
                    source.result.results.forEach((result: any) => {
                        if (result?.url) {
                            try {
                                const domain = new URL(result.url).hostname.replace('www.', '');
                                allSourcesSet.add(domain);
                            } catch (e) {
                                allSourcesSet.add('unknown');
                            }
                        }
                    });
                }
            });
        });
        const totalSources = allSourcesSet.size;

        return (
            <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
                <Accordion className="w-full">
                    <AccordionItem value="research" className="border-none">
                        <AccordionTrigger className="p-4 cursor-pointer w-full">
                            <div className="flex w-full justify-between items-center">
                                <div className="flex gap-2 items-center">
                                    <ListIcon className="size-3" />
                                    <span className="font-medium">Research</span>
                                </div>
                                <div className="flex flex-shrink-0 gap-2 text-xs opacity-80 ml-auto">
                                    <span>
                                        {totalGoals} {totalGoals === 1 ? 'goal' : 'goals'}
                                    </span>
                                    <span>•</span>
                                    <span>{totalQueries} queries</span>
                                    <span>•</span>
                                    <span>
                                        {totalSources} {totalSources === 1 ? 'source' : 'sources'}
                                    </span>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="space-y-6 p-4">
                                {allGoals.map((goalData, goalIndex) => (
                                    <div key={goalIndex} className="space-y-3">
                                        {goalIndex > 0 && (
                                            <hr className="border-neutral-800 my-4" />
                                        )}

                                        <div className="flex items-center gap-2">
                                            <div className="font-medium">{goalData.goal}</div>
                                        </div>

                                        <div className="w-full flex flex-col gap-3">
                                            <div className="w-full">
                                                <div className="text-xs font-medium mb-2">
                                                    Search Queries
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {goalData.queries.map((query, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                                        >
                                                            <SearchIcon className="size-3 text-neutral-400" />
                                                            <span className="text-xs">{query}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="w-full">
                                                <div className="text-xs font-medium mb-2">
                                                    Sources
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.entries(goalData.domainMap)
                                                        .sort(
                                                            (a: [string, any], b: [string, any]) =>
                                                                b[1].count - a[1].count
                                                        )
                                                        .map(([domain, info], idx) => (
                                                            <Link
                                                                key={idx}
                                                                target="_blank"
                                                                href={info.url}
                                                                className="flex items-center gap-1.5 max-w-xs truncate py-1 px-2 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                                                            >
                                                                <img
                                                                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                                                    width={12}
                                                                    height={12}
                                                                    className="rounded-sm"
                                                                    alt=""
                                                                />
                                                                <span className="text-xs font-medium truncate">
                                                                    {domain}
                                                                </span>
                                                                {info.count > 1 && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700 flex-shrink-0">
                                                                        {info.count}
                                                                    </span>
                                                                )}
                                                            </Link>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        );
    } catch (error) {
        console.error('Error rendering research:', error);
        return null;
    }
}
