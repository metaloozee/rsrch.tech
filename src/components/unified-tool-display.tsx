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
    GlobeIcon,
    NewspaperIcon,
    LineChartIcon,
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

// Define a more detailed structure for the workflow state
interface GoalState {
    id: string;
    state: 'start' | 'search_complete' | 'complete' | 'error';
    goalData?: any; // from goal annotation with state 'start'
    searches: {
        [queryId: string]: {
            state: 'call' | 'result' | 'error';
            data: any; // from search annotation
        };
    };
    analysis: {
        state: 'call' | 'result' | 'error';
        data?: any; // from analysis annotation
    };
}

interface WorkflowState {
    plan: { call: boolean; result: boolean; data?: any };
    report: { call: boolean; result: boolean; error?: string };
    goals: { [goalId: string]: GoalState };
    hasData: boolean;
    lastSearchCall?: any; // Store the last search call annotation for loading message
}

// Refactor extractResearchSteps to populate the new WorkflowState structure
function extractResearchSteps(message: Message): WorkflowState {
    const state: WorkflowState = {
        plan: { call: false, result: false },
        report: { call: false, result: false },
        goals: {},
        hasData: false,
    };

    if (message.role === 'assistant' && (message as any).annotations) {
        const annotations = (message as any).annotations || [];
        state.hasData = annotations.length > 0;

        annotations.forEach((annotation: any) => {
            const {
                type,
                state: annotationState,
                goal_id,
                query_id,
                data: annotationData,
            } = annotation;

            // Check if goal field exists directly in annotation
            const directGoal = annotation.goal;

            switch (type) {
                case 'plan':
                    if (annotationState === 'call') state.plan.call = true;
                    if (annotationState === 'result') state.plan.result = true;
                    state.plan.data = annotationData || state.plan.data;
                    break;
                case 'report':
                    if (annotationState === 'call') state.report.call = true;
                    if (annotationState === 'result') state.report.result = true;
                    if (annotationState === 'error') state.report.error = annotationData?.error;
                    break;
                case 'goal':
                    if (goal_id && !state.goals[goal_id]) {
                        state.goals[goal_id] = {
                            id: goal_id,
                            state: 'start',
                            searches: {},
                            analysis: { state: 'call' },
                            // Initialize with goal title if available directly
                            goalData: directGoal ? { goal: directGoal } : {},
                        };
                    }
                    if (goal_id && annotationState) {
                        if (annotationState === 'start') {
                            state.goals[goal_id].state = 'start';
                            // Update goalData, prioritizing direct goal field
                            state.goals[goal_id].goalData = {
                                ...(state.goals[goal_id]?.goalData || {}),
                                ...annotationData,
                                goal:
                                    directGoal ||
                                    annotationData?.goal ||
                                    state.goals[goal_id]?.goalData?.goal,
                            };
                        } else if (
                            annotationState === 'search_complete' &&
                            state.goals[goal_id].state === 'start'
                        ) {
                            state.goals[goal_id].state = 'search_complete';
                        } else if (
                            annotationState === 'complete' &&
                            (state.goals[goal_id].state === 'search_complete' ||
                                state.goals[goal_id].state === 'start')
                        ) {
                            state.goals[goal_id].state = 'complete';
                        } else if (annotationState === 'error') {
                            state.goals[goal_id].state = 'error';
                        }
                    }
                    break;
                case 'search':
                    if (goal_id) {
                        if (!state.goals[goal_id]) {
                            // Initialize goal if search appears first (shouldn't happen with new flow, but safe)
                            state.goals[goal_id] = {
                                id: goal_id,
                                state: 'start',
                                searches: {},
                                analysis: { state: 'call' },
                            };
                        }

                        const searchQueryId =
                            query_id ||
                            `query_${Object.keys(state.goals[goal_id].searches).length + 1}`;

                        if (!state.goals[goal_id].searches[searchQueryId]) {
                            state.goals[goal_id].searches[searchQueryId] = {
                                state: 'call',
                                data: {},
                            };
                        }

                        state.goals[goal_id].searches[searchQueryId].state = annotationState;

                        // Fix potential circular reference issue
                        if (annotationData) {
                            // Don't assign the data object to itself - this was causing an issue
                            const processedData =
                                annotationData.data !== undefined
                                    ? annotationData.data
                                    : annotationData;
                            state.goals[goal_id].searches[searchQueryId].data = processedData;
                        }

                        if (annotationState === 'call') {
                            state.lastSearchCall = annotationData;
                        }
                    }
                    break;
                case 'analysis':
                    if (goal_id) {
                        if (!state.goals[goal_id]) {
                            // Initialize goal if analysis appears first (unlikely)
                            state.goals[goal_id] = {
                                id: goal_id,
                                state: 'search_complete',
                                searches: {},
                                analysis: { state: 'call' },
                            };
                        }
                        state.goals[goal_id].analysis.state = annotationState;

                        // Handle both formats - either data is direct or nested
                        if (annotationData) {
                            state.goals[goal_id].analysis.data =
                                annotationData.data !== undefined
                                    ? annotationData.data
                                    : annotationData;
                        }
                    }
                    break;
            }
        });
    }

    // Check if we have any annotations at all
    const hasAnyAnnotations =
        state.plan.call ||
        state.plan.result ||
        state.report.call ||
        state.report.result ||
        Object.keys(state.goals).length > 0;

    // Set hasData if we have any relevant annotations
    state.hasData = state.hasData || hasAnyAnnotations;

    return state;
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
    // const tools = extractToolData(message); // Keep if needed for other tool types
    const workflowState = extractResearchSteps(message);

    // Add debugging to help identify issues
    console.log('UnifiedToolDisplay - workflowState:', workflowState);

    const hasAnnotations = (message as any).annotations && (message as any).annotations.length > 0;

    // Improve annotation detection logic
    const hasResearchAnnotations =
        (hasAnnotations || workflowState.hasData) &&
        (workflowState.plan.call ||
            workflowState.plan.result ||
            workflowState.report.call ||
            workflowState.report.result ||
            Object.keys(workflowState.goals).length > 0);

    console.log(
        'hasResearchAnnotations:',
        hasResearchAnnotations,
        'hasAnnotations:',
        hasAnnotations,
        'workflowState.hasData:',
        workflowState.hasData
    );

    if (hasResearchAnnotations) {
        return renderResearchWorkflow(workflowState);
    }

    // Fallback to old rendering if no research annotations
    const tools = extractToolData(message);
    if (tools && tools.length > 0) {
        return renderResearch(tools);
    }

    return null;
};

// Refactor renderResearchWorkflow to use the new WorkflowState
function renderResearchWorkflow(workflowState: WorkflowState) {
    const { plan, report, goals, lastSearchCall } = workflowState;
    const goalList = Object.values(goals).sort((a, b) => a.id.localeCompare(b.id)); // Sort for consistent order

    const isPlanning = plan.call && !plan.result;
    const anyGoalSearching = goalList.some((g) =>
        Object.values(g.searches).some((s) => s.state === 'call')
    );
    const allGoalsSearched =
        goalList.length > 0 &&
        goalList.every((g) => g.state === 'search_complete' || g.state === 'complete');
    const anyGoalAnalyzing = goalList.some((g) => g.analysis.state === 'call');
    const allGoalsAnalyzed = goalList.length > 0 && goalList.every((g) => g.state === 'complete'); // Assuming 'complete' implies analysis is done
    const isGeneratingFinal = report.call && !report.result;

    // Count the actual total number of searches across all goals
    const actualSearchCount = goalList.reduce((total, goal) => {
        return total + Object.keys(goal.searches).length;
    }, 0);

    // Use the actual count, falling back to the annotation data if available
    const overallSearchCount = actualSearchCount || plan.data?.total_search_queries || 0;

    console.log('Search statistics:', {
        actualSearchCount,
        fromAnnotation: plan.data?.total_search_queries,
        goalCount: goalList.length,
        searchesPerGoal: goalList.map((g) => ({
            goalId: g.id,
            searchCount: Object.keys(g.searches).length,
        })),
    });

    // Determine overall status text
    let statusText = 'Research completed';
    let statusIcon = null;
    if (isPlanning) {
        statusText = 'Planning research...';
        statusIcon = <LoaderCircleIcon className="size-3 animate-spin" />;
    } else if (anyGoalSearching) {
        statusText = 'Searching web...';
        statusIcon = <LoaderCircleIcon className="size-3 animate-spin" />;
    } else if (anyGoalAnalyzing) {
        statusText = 'Analyzing results...';
        statusIcon = <LoaderCircleIcon className="size-3 animate-spin" />;
    } else if (isGeneratingFinal) {
        statusText = 'Generating report...';
        statusIcon = <LoaderCircleIcon className="size-3 animate-spin" />;
    } else if (report.error) {
        statusText = 'Research failed';
        // Add an error icon maybe
    } else if (!report.result && goalList.length > 0) {
        // If all goals done but report not started/finished, maybe "Synthesizing..."
        statusText = 'Synthesizing findings...';
        statusIcon = <LoaderCircleIcon className="size-3 animate-spin" />;
    }

    return (
        <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
            {/* Keep Accordion structure */}
            <Accordion className="w-full">
                <AccordionItem value="research-workflow">
                    <AccordionTrigger className="p-4 cursor-pointer w-full hover:bg-neutral-800/30 transition-colors rounded-t-lg">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2 items-center">
                                <MapIcon className="size-3" />
                                <span className="font-medium">Research Workflow</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs opacity-80">
                                {statusIcon}
                                <span>{statusText}</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-neutral-950/50 rounded-b-lg">
                        <div className="space-y-4 p-4">
                            {/* Planning Section - Mostly unchanged */}
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
                                        ) : plan.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                {plan.data?.count || goalList.length || 0}{' '}
                                                {(plan.data?.count || goalList.length || 0) === 1
                                                    ? 'GOAL'
                                                    : 'GOALS'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                PENDING
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Optional: Display goals here if plan.result is true */}
                                {plan.result && plan.data?.data && (
                                    <div className="pt-2 space-y-1">
                                        {plan.data.data.map((g: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="text-xs pl-2 text-neutral-400"
                                            >
                                                {' '}
                                                - {g.goal}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Goals Section (Combined Search & Analysis Display) */}
                            {plan.result && goalList.length > 0 && (
                                <div className="flex flex-col space-y-2 border-b border-neutral-800 pb-4">
                                    <div className="flex w-full justify-between items-center">
                                        <div className="flex gap-2 items-center">
                                            {/* Use Search or Chart icon depending on phase? */}
                                            <SearchIcon className="size-3" />
                                            <span className="font-medium">Goal Execution</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs opacity-80">
                                            {anyGoalSearching || anyGoalAnalyzing ? (
                                                <div className="inline-flex justify-center items-center gap-2 px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-[10px]">
                                                    <Loader2Icon className="size-3 animate-spin" />
                                                    IN PROGRESS
                                                </div>
                                            ) : allGoalsAnalyzed ? (
                                                <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                    {overallSearchCount} SEARCHES
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                                                    PENDING
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Loading message during search */}
                                    {anyGoalSearching && lastSearchCall && (
                                        <div className="flex items-center gap-2 text-xs p-2">
                                            <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">
                                                Searching: "{lastSearchCall?.query || 'query'}"
                                                {lastSearchCall?.topic
                                                    ? `(${lastSearchCall.topic})`
                                                    : ''}
                                                ...
                                            </p>
                                        </div>
                                    )}

                                    {/* Display details for each goal */}
                                    <div className="text-xs text-neutral-400 py-2 space-y-4">
                                        <div className="space-y-3">
                                            {goalList.map((goal: GoalState) => {
                                                // Debug the goal data structure
                                                console.log(
                                                    'Rendering goal:',
                                                    goal.id,
                                                    'goalData:',
                                                    goal.goalData
                                                );

                                                // Try multiple potential locations for the goal title
                                                const goalTitle =
                                                    goal.goalData?.goal ||
                                                    (typeof goal.goalData === 'object' &&
                                                        goal.goalData !== null &&
                                                        Object.values(goal.goalData)[0]) ||
                                                    `Goal ${goal.id.split('_')[1]}`;

                                                // Get valid search queries (non-null)
                                                const searchQueries = Object.values(goal.searches)
                                                    .map((s) => {
                                                        // Handle different data structures
                                                        if (s.data?.query) return s.data.query;
                                                        if (
                                                            typeof s.data === 'object' &&
                                                            s.data !== null
                                                        ) {
                                                            // Try to find a query field at any level
                                                            for (const key in s.data) {
                                                                if (
                                                                    key === 'query' &&
                                                                    typeof s.data[key] === 'string'
                                                                ) {
                                                                    return s.data[key];
                                                                }
                                                            }
                                                        }
                                                        return null;
                                                    })
                                                    .filter(Boolean);

                                                // Count the actual search queries for this goal
                                                const searchCount = Object.keys(
                                                    goal.searches
                                                ).length;

                                                const searchResultsData = Object.values(
                                                    goal.searches
                                                )
                                                    .filter((s) => s.state === 'result')
                                                    .map((s) => {
                                                        // Try to find results in different potential locations
                                                        if (s.data?.result?.results)
                                                            return s.data.result;
                                                        if (s.data?.results) return s.data;
                                                        if (s.data?.result) return s.data.result;
                                                        return s.data;
                                                    })
                                                    .filter(Boolean);

                                                const domainMap: Record<
                                                    string,
                                                    { count: number; url: string; title: string }
                                                > = {};
                                                searchResultsData.forEach((searchResult: any) => {
                                                    // First check if results are directly available
                                                    const results = Array.isArray(
                                                        searchResult.results
                                                    )
                                                        ? searchResult.results
                                                        : // Then check if they're in a nested structure
                                                          Array.isArray(
                                                                searchResult.result?.results
                                                            )
                                                          ? searchResult.result.results
                                                          : // Try one more level
                                                            Array.isArray(searchResult)
                                                            ? searchResult
                                                            : [];

                                                    results.forEach((source: any) => {
                                                        try {
                                                            if (source && source.url) {
                                                                const sourceUrl = source.url;
                                                                const domain = new URL(
                                                                    sourceUrl
                                                                ).hostname.replace('www.', '');

                                                                if (!domainMap[domain]) {
                                                                    domainMap[domain] = {
                                                                        count: 0,
                                                                        url: sourceUrl,
                                                                        title:
                                                                            source.title || domain,
                                                                    };
                                                                }
                                                                domainMap[domain].count++;
                                                            }
                                                        } catch (e) {
                                                            console.error(
                                                                'Error processing URL:',
                                                                e
                                                            );
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
                                                });

                                                const goalIsSearching = Object.values(
                                                    goal.searches
                                                ).some((s) => s.state === 'call');
                                                const goalIsAnalyzing =
                                                    goal.analysis.state === 'call';
                                                const goalCompleted = goal.state === 'complete';

                                                let goalStatusBadge = (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800">
                                                        Pending
                                                    </span>
                                                );
                                                if (goalIsSearching) {
                                                    goalStatusBadge = (
                                                        <div className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">
                                                            <Loader2Icon className="size-2.5 animate-spin" />{' '}
                                                            Searching
                                                        </div>
                                                    );
                                                } else if (goalIsAnalyzing) {
                                                    goalStatusBadge = (
                                                        <div className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">
                                                            <Loader2Icon className="size-2.5 animate-spin" />{' '}
                                                            Analyzing
                                                        </div>
                                                    );
                                                } else if (goalCompleted) {
                                                    goalStatusBadge = (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">
                                                            Completed
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={goal.id}
                                                        className="border border-neutral-800 rounded-md"
                                                    >
                                                        {/* Use Disclosure for each goal */}
                                                        <Disclosure>
                                                            <DisclosureTrigger className="w-full">
                                                                <div className="flex flex-col gap-2 flex-wrap items-start justify-between p-3 w-full cursor-pointer hover:bg-neutral-800/30 transition-colors rounded-t-md">
                                                                    <div className="font-medium md:max-w-lg">
                                                                        {goalTitle}
                                                                    </div>
                                                                    <div className="flex flex-wrap items-start justify-start gap-2">
                                                                        {goalStatusBadge}
                                                                        {searchCount > 0 && (
                                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800">
                                                                                {searchCount}{' '}
                                                                                {searchCount === 1
                                                                                    ? 'query'
                                                                                    : 'queries'}
                                                                            </span>
                                                                        )}
                                                                        {Object.keys(domainMap)
                                                                            .length > 0 && (
                                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800">
                                                                                {
                                                                                    Object.keys(
                                                                                        domainMap
                                                                                    ).length
                                                                                }{' '}
                                                                                {Object.keys(
                                                                                    domainMap
                                                                                ).length === 1
                                                                                    ? 'source'
                                                                                    : 'sources'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </DisclosureTrigger>
                                                            <DisclosureContent>
                                                                <div className="px-3 py-4 space-y-3 border-t border-neutral-800">
                                                                    {/* Search Queries for this goal */}
                                                                    {searchCount > 0 && (
                                                                        <div className="space-y-1">
                                                                            <div className="text-[11px] font-medium text-neutral-400">
                                                                                Search Queries
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {Object.values(
                                                                                    goal.searches
                                                                                ).map(
                                                                                    (
                                                                                        search,
                                                                                        qIndex
                                                                                    ) => {
                                                                                        // Get query text and topic from the search data
                                                                                        let queryText =
                                                                                            '';
                                                                                        let queryTopic =
                                                                                            'general';

                                                                                        if (
                                                                                            search
                                                                                                .data
                                                                                                ?.query
                                                                                        ) {
                                                                                            queryText =
                                                                                                search
                                                                                                    .data
                                                                                                    .query;
                                                                                        }

                                                                                        if (
                                                                                            search
                                                                                                .data
                                                                                                ?.topic
                                                                                        ) {
                                                                                            queryTopic =
                                                                                                search
                                                                                                    .data
                                                                                                    .topic;
                                                                                        }

                                                                                        // If we still don't have query text, use a placeholder
                                                                                        if (
                                                                                            !queryText
                                                                                        ) {
                                                                                            queryText = `Search ${qIndex + 1}`;
                                                                                        }

                                                                                        // Get the appropriate icon based on topic
                                                                                        const TopicIcon =
                                                                                            (() => {
                                                                                                switch (
                                                                                                    queryTopic
                                                                                                ) {
                                                                                                    case 'news':
                                                                                                        return NewspaperIcon;
                                                                                                    case 'finance':
                                                                                                        return LineChartIcon;
                                                                                                    case 'general':
                                                                                                    default:
                                                                                                        return GlobeIcon;
                                                                                                }
                                                                                            })();

                                                                                        return (
                                                                                            <div
                                                                                                key={
                                                                                                    qIndex
                                                                                                }
                                                                                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-700"
                                                                                            >
                                                                                                <TopicIcon className="size-2 text-neutral-400" />
                                                                                                <span className="text-[11px]">
                                                                                                    {
                                                                                                        queryText
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        );
                                                                                    }
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Sources/Domains for this goal */}
                                                                    {Object.keys(domainMap).length >
                                                                        0 && (
                                                                        <div className="space-y-1">
                                                                            <div className="text-[11px] font-medium text-neutral-400">
                                                                                Sources
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {Object.entries(
                                                                                    domainMap
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
                                                                                                title={`${info.title} (${info.url})`}
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

                                                                    {/* Analysis Result for this goal */}
                                                                    {/* {goal.analysis.state === 'result' && goal.analysis.data && (
                                                                        <div className="space-y-1 pt-2">
                                                                              <div className="text-[11px] font-medium text-neutral-400">
                                                                                 Analysis Summary
                                                                              </div>
                                                                              <p className="text-xs text-neutral-300 bg-neutral-800/30 p-2 rounded-md border border-neutral-800">
                                                                                 {typeof goal.analysis.data === 'string'
                                                                                     ? goal.analysis.data
                                                                                     : JSON.stringify(goal.analysis.data)}
                                                                              </p>
                                                                         </div>
                                                                    )} */}

                                                                    {/* Replaced Analysis Summary with Goal-Specific Sources */}
                                                                </div>
                                                            </DisclosureContent>
                                                        </Disclosure>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Report Generation Section - Mostly unchanged */}
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
                                        ) : report.result ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px]">
                                                COMPLETED
                                            </span>
                                        ) : report.error ? (
                                            <span className="inline-flex px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 text-[10px]">
                                                ERROR
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

// Keep renderResearch if needed as fallback or for other tool types, otherwise remove.
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
