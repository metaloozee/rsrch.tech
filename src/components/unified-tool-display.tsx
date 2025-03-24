'use client';

import { useState } from 'react';
import { ListIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import { Message } from 'ai';

export type ToolData = {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args: any;
    result?: any;
};

export type ResearchGoal = {
    goal: string;
    analysis?: string;
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
    if (!tools || tools.length === 0) {
        return null;
    }

    return renderResearch(tools);
};

function renderResearch(tools: ToolData[]) {
    const searchTools = tools.filter((tool) => tool.toolName === 'web_search');

    if (searchTools.length === 0) {
        return null;
    }

    const resultTools = searchTools.filter((tool) => tool.state === 'result' && tool.result);
    const isLoading = searchTools.some((tool) => tool.state === 'call');

    if (isLoading || resultTools.length === 0) {
        return (
            <Accordion className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
                <AccordionItem value="research" className="border-none">
                    <AccordionTrigger className="p-4 cursor-pointer w-full">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2 items-center">
                                <ListIcon className="size-3" />
                                <span className="font-medium">Research</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs opacity-80">
                                <LoaderCircleIcon className="size-3 animate-spin" />
                                <span>{isLoading ? 'Searching...' : 'Processing results...'}</span>
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
        );
    }

    try {
        // Process all search results
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
        const totalQueries = allGoals.reduce((sum, goal) => sum + goal.queries.length, 0);

        const allSourcesSet = new Set<string>();
        allGoals.forEach((goal) => {
            Object.entries(goal.domainMap).forEach(([domain]) => allSourcesSet.add(domain));
        });
        const totalSources = allSourcesSet.size;

        return (
            <Accordion className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
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
                                    {goalIndex > 0 && <hr className="border-neutral-800 my-4" />}

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
                                            <div className="text-xs font-medium mb-2">Sources</div>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(goalData.domainMap)
                                                    .sort((a, b) => b[1].count - a[1].count)
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
        );
    } catch (error) {
        console.error('Error rendering research:', error);
        return null;
    }
}
