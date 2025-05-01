'use client';

import {
    ListIcon,
    Loader2Icon,
    MapIcon,
    CheckCircle2,
    XCircle,
    FileText,
    Target,
    CircleDot,
    RefreshCw,
    MinusCircle,
} from 'lucide-react';
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

type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'error' | 'stopped';
type GoalStatus =
    | 'pending'
    | 'in_progress'
    | 'searching'
    | 'analyzing'
    | 'reflecting'
    | 'requeued'
    | 'completed'
    | 'failed';

interface PlanPhaseState {
    status: PhaseStatus;
    goalCount: number;
    totalQueryCount: number;
    goals?: Array<{ goal: string; search_queries: string[] }>;
}

interface SearchInfo {
    queryId: string;
    query: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    resultCount?: number;
    error?: string;
}

interface AnalysisInfo {
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    relevantResultCountThisIteration: number;
    uniqueResultCount: number;
    error?: string;
    newAngleFound: boolean;
    newAngleDescription?: string;
}

interface GoalPhaseState {
    id: string;
    status: GoalStatus;
    statusReason?: string;
    goalTitle: string;
    searchQueries: SearchInfo[];
    analysisLog: AnalysisInfo[];
    currentAnalysis: AnalysisInfo;
    rawSearchResultsCount: number;
    relevantResultCountTotal: number;
    searchesAttempted: number;
    maxSearchesPerGoal: number;
}

interface ReflectionInfo {
    shouldAddNewGoals?: boolean;
    newGoals?: Array<{ goal: string; initial_search_queries: string[] }>;
    assessmentOfCurrentGoal?: 'completed' | 'needs_more_searches' | 'failed';
    nextActionSuggestion?: string;
    error?: string;
}

interface ReportPhaseState {
    status: PhaseStatus;
    error?: string;
}

interface WorkflowState {
    currentIteration: number;
    maxIterations: number;
    overallStatusText: string;
    agentStopReason?: string;
    hasData: boolean;
    lastSearchCall?: { query: string };
    lastReflection?: ReflectionInfo;
    plan: PlanPhaseState;
    goals: GoalPhaseState[];
    addedGoalsLog: Array<{ id: string; goal: string }>;
    report: ReportPhaseState;
}

const StatusIcon = ({ status }: { status: PhaseStatus | GoalStatus }) => {
    switch (status) {
        case 'pending':
            return <CircleDot className="size-3 text-neutral-500" />;
        case 'in_progress':
        case 'searching':
        case 'analyzing':
        case 'reflecting':
            return <Loader2Icon className="size-3 animate-spin text-blue-500" />;
        case 'requeued':
            return <RefreshCw className="size-3 text-yellow-500" />;
        case 'completed':
            return <CheckCircle2 className="size-3 text-green-500" />;
        case 'failed':
        case 'error':
            return <XCircle className="size-3 text-red-500" />;
        case 'stopped':
            return <MinusCircle className="size-3 text-neutral-500" />;
        default:
            return null;
    }
};

const PhaseDisplay = ({
    icon,
    title,
    status,
    children,
    details,
}: {
    icon: React.ElementType;
    title: string;
    status: PhaseStatus | GoalStatus;
    children?: React.ReactNode;
    details?: string | React.ReactNode;
}) => {
    const IconComponent = icon;
    const displayStatus = ['searching', 'analyzing', 'reflecting', 'requeued'].includes(status)
        ? 'in_progress'
        : status;

    return (
        <div className="flex flex-col space-y-2 border-neutral-800 pb-4">
            <div className="flex w-full justify-between items-center mb-1">
                <div className="flex gap-2 items-center">
                    <IconComponent className="size-3.5" />
                    <span className="font-medium">{title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs opacity-80">
                    <StatusIcon status={status} />
                    <span
                        className={`capitalize ${
                            status === 'error' || status === 'failed' ? 'text-red-400' : ''
                        } ${status === 'requeued' ? 'text-yellow-400' : ''}`}
                    >
                        {status.replace('_', ' ')}
                    </span>
                    {details && <span className="text-neutral-400 pl-1">{details}</span>}
                </div>
            </div>
            {children && <div className="pl-5">{children}</div>}
        </div>
    );
};

function parseJsonIfString(value: any): any {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        return value;
    }
}

function extractToolDataFromPart(part: any): ToolData | null {
    if (part.type === 'tool-call' || part.type === 'tool_call') {
        if (part.toolName && part.toolCallId) {
            return {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: 'call',
                args: parseJsonIfString(part.args),
                result: null,
            };
        }
        return {
            toolCallId: part.tool?.id || part.data?.toolCallId || 'sdk-tool-id',
            toolName: part.tool?.name || part.data?.toolName || 'sdk-tool',
            state: part.data?.state || 'result',
            args: parseJsonIfString(part.tool?.input || part.data?.args),
            result: parseJsonIfString(part.tool?.output || part.data?.result),
        };
    }

    if (part.type === 'tool-result' || part.type === 'tool_result') {
        if (part.toolCallId && part.toolName) {
            return {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: 'result',
                args: {},
                result: parseJsonIfString(part.result),
            };
        }
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
    const workflowState = extractResearchSteps(message);

    const hasAnnotations = (message as any).annotations && (message as any).annotations.length > 0;

    const hasResearchAnnotations =
        (hasAnnotations || workflowState.hasData) &&
        (workflowState.plan.status === 'in_progress' ||
            workflowState.plan.status === 'pending' ||
            workflowState.report.status === 'in_progress' ||
            workflowState.report.status === 'pending' ||
            Object.keys(workflowState.goals).length > 0);

    if (hasResearchAnnotations) {
        return renderResearchWorkflow(workflowState);
    }

    const tools = extractToolData(message);
    if (tools && tools.length > 0) {
        console.log('Falling back to renderResearch for tools:', tools);
    }

    return null;
};

function renderResearchWorkflow(workflowState: WorkflowState) {
    const {
        overallStatusText,
        hasData,
        lastSearchCall,
        plan,
        goals,
        report,
        currentIteration,
        maxIterations,
        agentStopReason,
        addedGoalsLog,
        lastReflection,
    } = workflowState;

    if (!hasData) {
        return null;
    }

    const goalsArray = goals;
    const goalsInProgress = goalsArray.filter(
        (g) => g.status !== 'completed' && g.status !== 'failed' && g.status !== 'pending'
    ).length;
    const goalsCompleted = goalsArray.filter((g) => g.status === 'completed').length;
    const goalsFailed = goalsArray.filter((g) => g.status === 'failed').length;
    const goalsPending = goalsArray.filter(
        (g) => g.status === 'pending' || g.status === 'requeued'
    ).length;

    let goalPhaseStatus: PhaseStatus = 'pending';
    if (goalsArray.length === 0 && plan.status === 'completed') {
        goalPhaseStatus = 'completed';
    } else if (goalsInProgress > 0) {
        goalPhaseStatus = 'in_progress';
    } else if (goalsCompleted + goalsFailed === goalsArray.length && goalsArray.length > 0) {
        goalPhaseStatus = goalsFailed > 0 ? 'error' : 'completed';
    } else if (goalsPending === goalsArray.length && plan.status === 'completed') {
        goalPhaseStatus = 'pending';
    } else if (plan.status === 'completed' && goalsArray.length > 0 && goalsInProgress === 0) {
        if (goalsFailed > 0) goalPhaseStatus = 'error';
        else if (goalsCompleted === goalsArray.length) goalPhaseStatus = 'completed';
        else goalPhaseStatus = 'pending';
    } else if (plan.status === 'error') {
        goalPhaseStatus = 'pending';
    }

    const goalDetailsSummary =
        goalsArray.length > 0
            ? `(${goalsCompleted}/${goalsArray.length} Done${goalsFailed > 0 ? `, ${goalsFailed} Failed` : ''})`
            : '(No Goals Defined)';

    let overallStatusIconType: PhaseStatus = 'pending';
    if (agentStopReason) {
        overallStatusIconType =
            plan.status === 'error' || goalPhaseStatus === 'error' || report.status === 'error'
                ? 'error'
                : 'stopped';
    } else if (
        report.status === 'error' ||
        goalPhaseStatus === 'error' ||
        plan.status === 'error'
    ) {
        overallStatusIconType = 'error';
    } else if (report.status === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (goalPhaseStatus === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (plan.status === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (report.status === 'completed') {
        overallStatusIconType = 'completed';
    } else if (plan.status === 'completed' && goalPhaseStatus === 'completed') {
        overallStatusIconType = report.status === 'pending' ? 'pending' : report.status;
    }

    const showGoalExecution = plan.status === 'completed' || goalsArray.length > 0;
    const showReportGeneration =
        (plan.status === 'error' ||
            goalPhaseStatus === 'completed' ||
            goalPhaseStatus === 'error' ||
            report.status !== 'pending') &&
        plan.status !== 'pending';

    return (
        <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
            <Accordion className="w-full">
                <AccordionItem value="research-workflow" className="border-none">
                    <AccordionTrigger className="p-4 cursor-pointer w-full hover:bg-neutral-800/30 transition-colors rounded-t-lg">
                        <div className="flex flex-wrap shrink-0 gap-2 w-full justify-between items-center">
                            <div className="flex gap-2 items-center">
                                <MapIcon className="size-3.5" />
                                <span className="font-medium">Research Workflow</span>
                                {currentIteration > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700/50">
                                        Iter: {currentIteration}
                                        {maxIterations > 0 ? `/${maxIterations}` : ''}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-center shrink-0 gap-2 text-xs opacity-80">
                                <StatusIcon status={overallStatusIconType} />
                                <span className="text-left truncate max-w-xl">
                                    {agentStopReason
                                        ? `Stopped: ${agentStopReason}`
                                        : overallStatusText}
                                </span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-neutral-950/50 rounded-b-lg">
                        <div className="p-4 last:pb-0">
                            <PhaseDisplay
                                icon={ListIcon}
                                title="Planning"
                                status={plan.status}
                                details={undefined}
                            >
                                {plan.status === 'in_progress' && (
                                    <p className="text-xs text-neutral-400">
                                        Identifying initial research goals and queries...
                                    </p>
                                )}
                                {plan.status === 'error' && (
                                    <p className="text-xs text-red-400">
                                        Failed to generate research plan. Halting process.
                                    </p>
                                )}
                            </PhaseDisplay>

                            {showGoalExecution && (
                                <PhaseDisplay
                                    icon={Target}
                                    title="Goal Execution & Refinement"
                                    status={goalPhaseStatus}
                                    details={goalDetailsSummary}
                                >
                                    {goalPhaseStatus === 'in_progress' &&
                                        lastSearchCall &&
                                        goalsArray.some((g) => g.status === 'searching') && (
                                            <div className="flex items-center gap-2 text-xs p-1 text-neutral-400">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                <span>Searching: "{lastSearchCall.query}"...</span>
                                            </div>
                                        )}
                                    {goalPhaseStatus === 'in_progress' &&
                                        goalsArray.some((g) => g.status === 'analyzing') && (
                                            <div className="flex items-center gap-2 text-xs p-1 text-neutral-400">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                <span>Analyzing results...</span>
                                            </div>
                                        )}
                                    {goalPhaseStatus === 'in_progress' &&
                                        goalsArray.some((g) => g.status === 'reflecting') && (
                                            <div className="flex items-center gap-2 text-xs p-1 text-neutral-400">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                <span>Reflecting on findings...</span>
                                            </div>
                                        )}

                                    {goalsArray.length > 0 ? (
                                        <Accordion className="w-full">
                                            <div className="space-y-2 py-2">
                                                {goalsArray.map((goal) => {
                                                    const completedQueries =
                                                        goal.searchQueries.filter(
                                                            (q) => q.status === 'completed'
                                                        ).length;
                                                    const erroredQueries =
                                                        goal.searchQueries.filter(
                                                            (q) => q.status === 'error'
                                                        ).length;
                                                    const totalQueries = goal.searchQueries.length;
                                                    const maxSearches =
                                                        goal.maxSearchesPerGoal > 0
                                                            ? goal.maxSearchesPerGoal
                                                            : '?';

                                                    let goalStatusText = goal.status.replace(
                                                        '_',
                                                        ' '
                                                    );
                                                    if (goal.status === 'in_progress')
                                                        goalStatusText = 'Processing';
                                                    else if (
                                                        goal.status === 'failed' &&
                                                        goal.statusReason
                                                    )
                                                        goalStatusText = `Failed (${goal.statusReason})`;
                                                    else if (
                                                        goal.status === 'completed' &&
                                                        goal.statusReason
                                                    )
                                                        goalStatusText = `Completed (${goal.statusReason})`;
                                                    else if (
                                                        goal.status === 'requeued' &&
                                                        goal.statusReason
                                                    )
                                                        goalStatusText = `Requeued (${goal.statusReason})`;

                                                    return (
                                                        <AccordionItem
                                                            key={goal.id}
                                                            value={goal.id}
                                                            className="border border-neutral-800 rounded-md bg-neutral-900/30 overflow-hidden"
                                                        >
                                                            <AccordionTrigger className="flex flex-col shrink-0 items-start gap-1 p-2 w-full hover:bg-neutral-800/40 data-[state=open]:bg-neutral-800/40 transition-colors text-left hover:no-underline">
                                                                <div className="flex items-center gap-1 flex-grow">
                                                                    <StatusIcon
                                                                        status={goal.status}
                                                                    />
                                                                    <span
                                                                        className="font-medium text-xs truncate max-w-xl"
                                                                        title={goal.goalTitle}
                                                                    >
                                                                        {goal.goalTitle}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap shrink-0 items-center gap-2 text-[10px] text-neutral-400">
                                                                    <span className="capitalize">
                                                                        {goalStatusText}
                                                                    </span>
                                                                    {totalQueries > 0 && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-neutral-700/50">
                                                                            {goal.searchesAttempted}{' '}
                                                                            Searches
                                                                        </span>
                                                                    )}
                                                                    {goal.relevantResultCountTotal >
                                                                        0 && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-neutral-700/50">
                                                                            {
                                                                                goal.relevantResultCountTotal
                                                                            }{' '}
                                                                            Rel.
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="text-xs bg-neutral-950/30 border-t border-neutral-800">
                                                                <div className="p-2.5 space-y-2.5">
                                                                    <div>
                                                                        <span className="font-medium text-neutral-400">
                                                                            Status:{' '}
                                                                        </span>
                                                                        <span
                                                                            className={`capitalize ${
                                                                                goal.status ===
                                                                                'failed'
                                                                                    ? 'text-red-400'
                                                                                    : goal.status ===
                                                                                        'requeued'
                                                                                      ? 'text-yellow-400'
                                                                                      : ''
                                                                            }`}
                                                                        >
                                                                            {goalStatusText}
                                                                        </span>
                                                                        {goal.statusReason &&
                                                                            goal.status !==
                                                                                'completed' &&
                                                                            goal.status !==
                                                                                'failed' &&
                                                                            goal.status !==
                                                                                'requeued' && (
                                                                                <span className="text-neutral-500 text-[10px] ml-1">
                                                                                    (
                                                                                    {
                                                                                        goal.statusReason
                                                                                    }
                                                                                    )
                                                                                </span>
                                                                            )}
                                                                    </div>

                                                                    {goal.analysisLog.length >
                                                                        0 && (
                                                                        <div>
                                                                            {goal.currentAnalysis
                                                                                .newAngleFound && (
                                                                                <div className="text-[10px] text-yellow-400/80 mt-1">
                                                                                    {goal
                                                                                        .currentAnalysis
                                                                                        .newAngleDescription ||
                                                                                        'Identified'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    );
                                                })}
                                            </div>
                                        </Accordion>
                                    ) : (
                                        <p className="text-xs text-neutral-500 pt-1">
                                            {plan.status === 'completed'
                                                ? 'No goals defined or added yet.'
                                                : 'Waiting for planning phase...'}
                                        </p>
                                    )}
                                </PhaseDisplay>
                            )}

                            {showReportGeneration && (
                                <PhaseDisplay
                                    icon={FileText}
                                    title="Report Generation"
                                    status={report.status}
                                >
                                    {report.status === 'error' && (
                                        <p className="text-xs text-red-400">
                                            Error generating report:{' '}
                                            {report.error || 'Unknown error'}
                                        </p>
                                    )}
                                </PhaseDisplay>
                            )}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}

function extractResearchSteps(message: Message): WorkflowState {
    const initialGoalDef: Omit<GoalPhaseState, 'id' | 'goalTitle' | 'maxSearchesPerGoal'> = {
        status: 'pending',
        searchQueries: [],
        analysisLog: [],
        currentAnalysis: {
            status: 'pending',
            relevantResultCountThisIteration: 0,
            uniqueResultCount: 0,
            newAngleFound: false,
        },
        rawSearchResultsCount: 0,
        relevantResultCountTotal: 0,
        searchesAttempted: 0,
    };

    const state: WorkflowState = {
        currentIteration: 0,
        maxIterations: 10,
        overallStatusText: 'Initializing Research...',
        hasData: false,
        plan: { status: 'pending', goalCount: 0, totalQueryCount: 0 },
        goals: [],
        addedGoalsLog: [],
        report: { status: 'pending' },
    };

    const goalsMap = new Map<string, GoalPhaseState>();

    const annotations = (message as any).annotations;
    if (annotations && Array.isArray(annotations) && annotations.length > 0) {
        state.hasData = true;
    } else {
        const tools = extractToolData(message);
        if (tools.length > 0) {
            state.hasData = true;
            state.overallStatusText = 'Processing research data (legacy format)...';
        } else {
            return state;
        }
    }

    annotations.forEach((annotation: any) => {
        const {
            type,
            state: annotationState,
            goal_id,
            query_id,
            iteration,
            data: annotationData,
            goal: directGoal,
            queries: directQueries,
            count: planGoalCount,
            total_search_queries: planTotalQueries,
            query: directQuery,
            isRelevant: analysisIsRelevant,
            newAngleFound: analysisNewAngleFound,
            unique_results_count: analysisUniqueCount,
            relevant_found_this_iteration: goalRelevantThisIter,
            total_relevant_for_goal: goalRelevantTotal,
            searches_attempted_for_goal: goalSearchesAttempted,
            reason: statusReason,
            error: directError,
            message: errorMessage,
            research_summary,
            total_iterations: finalTotalIterations,
            agent_stop_reason: directAgentStopReason,
        } = annotation;

        if (typeof iteration === 'number' && iteration > state.currentIteration) {
            state.currentIteration = iteration;
        }
        if (
            typeof finalTotalIterations === 'number' &&
            finalTotalIterations > state.currentIteration
        ) {
            state.currentIteration = finalTotalIterations;
        }

        const errorMsg = directError || errorMessage || annotationData?.error || 'Unknown error';
        const parsedData = parseJsonIfString(annotationData);

        const ensureGoalExists = (gid: string, title?: string): GoalPhaseState => {
            if (!goalsMap.has(gid)) {
                goalsMap.set(gid, {
                    ...initialGoalDef,
                    id: gid,
                    goalTitle: title || `Goal ${gid.split('_')[1] || gid}`,
                    maxSearchesPerGoal: 5,
                });
            }
            return goalsMap.get(gid)!;
        };

        switch (type) {
            case 'agent_init':
                if (annotationState === 'start') {
                    state.overallStatusText = 'Agent Initialized...';
                }
                break;

            case 'plan':
                if (annotationState === 'call') {
                    state.plan.status = 'in_progress';
                    state.overallStatusText = 'Planning Research...';
                } else if (annotationState === 'result') {
                    state.plan.status = 'completed';
                    state.plan.goalCount = planGoalCount || parsedData?.count || 0;
                    state.plan.totalQueryCount =
                        planTotalQueries || parsedData?.total_search_queries || 0;
                    state.plan.goals = parsedData?.data || parsedData?.goals || [];
                    state.overallStatusText =
                        state.plan.goalCount > 0
                            ? `Plan Complete: ${state.plan.goalCount} Goals, ${state.plan.totalQueryCount} Queries`
                            : 'Plan Complete: No initial goals identified.';

                    if (state.plan.goals && state.plan.goals.length > 0) {
                        state.plan.goals.forEach((goalData, index) => {
                            const gid = `goal_${index + 1}`;
                            const goal = ensureGoalExists(gid, goalData.goal);
                            const existingQueries = new Map(
                                goal.searchQueries.map((q) => [q.queryId, q])
                            );
                            (goalData.search_queries || []).forEach((q, qIdx) => {
                                const queryId = `${gid}_query_${qIdx + 1}`;
                                if (!existingQueries.has(queryId)) {
                                    goal.searchQueries.push({
                                        queryId,
                                        query: q,
                                        status: 'pending',
                                    });
                                }
                            });
                        });
                    } else if (state.plan.goalCount === 0) {
                        state.report.status = 'completed';
                    }
                } else if (annotationState === 'error') {
                    state.plan.status = 'error';
                    state.overallStatusText = `Planning Failed: ${errorMsg}`;
                    state.agentStopReason = 'Planning Failed';
                }
                break;

            case 'goal_iteration':
                if (goal_id && annotationState === 'start') {
                    const goal = ensureGoalExists(goal_id, directGoal || parsedData?.goal);
                    goal.status = 'in_progress';
                    goal.currentAnalysis = {
                        status: 'pending',
                        relevantResultCountThisIteration: 0,
                        uniqueResultCount: 0,
                        newAngleFound: false,
                    };
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Processing Goal "${goal.goalTitle}"`;
                    }
                }
                break;

            case 'search_batch':
                if (goal_id && annotationState === 'start') {
                    const goal = ensureGoalExists(goal_id);
                    goal.status = 'searching';
                    const queriesInBatch = directQueries || parsedData?.queries || [];
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Starting search batch (${queriesInBatch.length} queries) for "${goal.goalTitle}"`;
                    }
                }
                break;

            case 'search':
                if (!goal_id || !query_id) break;
                const searchGoal = ensureGoalExists(goal_id);

                if (searchGoal.status === 'completed' || searchGoal.status === 'failed') break;

                let searchQuery = searchGoal.searchQueries.find((sq) => sq.queryId === query_id);
                const queryText = directQuery || parsedData?.query;

                if (!searchQuery && queryText) {
                    searchQuery = { queryId: query_id, query: queryText, status: 'pending' };
                    searchGoal.searchQueries.push(searchQuery);
                } else if (
                    searchQuery &&
                    queryText &&
                    (!searchQuery.query || searchQuery.query === 'query')
                ) {
                    searchQuery.query = queryText;
                } else if (!searchQuery) {
                    console.warn(
                        `Search annotation for unknown queryId ${query_id} in goal ${goal_id}`
                    );
                    break;
                }

                if (annotationState === 'call') {
                    searchQuery.status = 'in_progress';
                    searchGoal.status = 'searching';
                    state.lastSearchCall = { query: searchQuery.query };
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Searching: "${searchQuery.query}"`;
                    }
                } else if (annotationState === 'result') {
                    searchQuery.status = 'completed';
                    searchQuery.resultCount =
                        typeof parsedData?.resultCount === 'number' ? parsedData.resultCount : 0;
                    state.lastSearchCall = undefined;
                } else if (annotationState === 'error') {
                    searchQuery.status = 'error';
                    searchQuery.error = errorMsg;
                    state.lastSearchCall = undefined;
                }
                break;

            case 'analysis':
                if (!goal_id) break;
                const analysisGoalCall = ensureGoalExists(goal_id);
                if (analysisGoalCall.status === 'completed' || analysisGoalCall.status === 'failed')
                    break;

                if (annotationState === 'call') {
                    analysisGoalCall.status = 'analyzing';
                    analysisGoalCall.currentAnalysis.status = 'in_progress';
                    analysisGoalCall.currentAnalysis.uniqueResultCount =
                        typeof analysisUniqueCount === 'number'
                            ? analysisUniqueCount
                            : typeof parsedData?.unique_results_count === 'number'
                              ? parsedData.unique_results_count
                              : analysisGoalCall.currentAnalysis.uniqueResultCount;
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Analyzing ${analysisGoalCall.currentAnalysis.uniqueResultCount} results for "${analysisGoalCall.goalTitle}"`;
                    }
                } else if (annotationState === 'error') {
                    analysisGoalCall.status = 'failed';
                    analysisGoalCall.currentAnalysis.status = 'error';
                    analysisGoalCall.currentAnalysis.error = errorMsg;
                    analysisGoalCall.status = 'failed';
                    analysisGoalCall.statusReason = `Analysis Failed: ${errorMsg}`;
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Analysis Error for "${analysisGoalCall.goalTitle}"`;
                    }
                }
                break;

            case 'analysis_result':
                if (!goal_id) break;
                const analysisResGoal = ensureGoalExists(goal_id);
                if (analysisResGoal.status === 'completed' || analysisResGoal.status === 'failed')
                    break;

                analysisResGoal.status = 'analyzing';
                analysisResGoal.currentAnalysis.status = 'in_progress';

                let analysisData;
                try {
                    analysisData =
                        typeof parsedData === 'string' ? JSON.parse(parsedData) : parsedData;
                } catch {
                    analysisData = {};
                }

                if (analysisIsRelevant === true || analysisData?.isRelevant === true) {
                }
                if (analysisNewAngleFound === true || analysisData?.newAngleFound === true) {
                    analysisResGoal.currentAnalysis.newAngleFound = true;
                    analysisResGoal.currentAnalysis.newAngleDescription =
                        analysisData?.new_angle ||
                        analysisResGoal.currentAnalysis.newAngleDescription ||
                        'Identified';
                }
                break;

            case 'goal_progress':
                if (!goal_id) break;
                const progressGoal = ensureGoalExists(goal_id);
                if (progressGoal.status === 'completed' || progressGoal.status === 'failed') break;

                progressGoal.status = 'analyzing';
                progressGoal.currentAnalysis.status = 'completed';
                progressGoal.currentAnalysis.relevantResultCountThisIteration =
                    typeof goalRelevantThisIter === 'number' ? goalRelevantThisIter : 0;
                progressGoal.relevantResultCountTotal =
                    typeof goalRelevantTotal === 'number'
                        ? goalRelevantTotal
                        : progressGoal.relevantResultCountTotal;
                progressGoal.searchesAttempted =
                    typeof goalSearchesAttempted === 'number'
                        ? goalSearchesAttempted
                        : progressGoal.searchesAttempted;

                progressGoal.analysisLog.push({ ...progressGoal.currentAnalysis });

                if (state.report.status === 'pending' && !state.agentStopReason) {
                    state.overallStatusText = `Iteration ${state.currentIteration}: Analysis complete for "${progressGoal.goalTitle}" (${progressGoal.currentAnalysis.relevantResultCountThisIteration} relevant found this cycle). Reflecting...`;
                }
                break;

            case 'reflection':
                if (!goal_id) break;
                const reflectGoal = ensureGoalExists(goal_id);
                if (reflectGoal.status === 'completed' || reflectGoal.status === 'failed') break;

                if (annotationState === 'call') {
                    reflectGoal.status = 'reflecting';
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Reflecting on findings for "${reflectGoal.goalTitle}"`;
                    }
                } else if (annotationState === 'result') {
                    reflectGoal.status = 'reflecting';
                    state.lastReflection = parsedData || {};
                } else if (annotationState === 'error') {
                    reflectGoal.status = 'failed';
                    state.lastReflection = { error: errorMsg };
                    reflectGoal.statusReason = `Reflection Failed: ${errorMsg}`;
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Iteration ${state.currentIteration}: Reflection Error for "${reflectGoal.goalTitle}"`;
                    }
                }
                break;

            case 'goal_add':
                if (goal_id && directGoal) {
                    ensureGoalExists(goal_id, directGoal);
                    state.addedGoalsLog.push({ id: goal_id, goal: directGoal });
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `New goal added: "${directGoal}"`;
                    }
                }
                break;

            case 'goal_requeue':
                if (goal_id) {
                    const goal = ensureGoalExists(goal_id);
                    goal.status = 'requeued';
                    goal.statusReason = statusReason || 'Needs more searches';
                    if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Goal "${goal.goalTitle}" requeued (${goal.statusReason}).`;
                    }
                }
                break;

            case 'goal_complete':
                if (goal_id) {
                    const goal = ensureGoalExists(goal_id);
                    goal.status = 'completed';
                    goal.statusReason = statusReason || 'Marked complete by reflection';
                    const allGoalsFinishedCheck = Array.from(goalsMap.values()).every(
                        (g) => g.status === 'completed' || g.status === 'failed'
                    );
                    if (
                        allGoalsFinishedCheck &&
                        state.report.status === 'pending' &&
                        !state.agentStopReason
                    ) {
                        state.overallStatusText = `All goals processed. Preparing report...`;
                    } else if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Goal "${goal.goalTitle}" completed (${goal.statusReason}).`;
                    }
                }
                break;

            case 'goal_fail':
                if (goal_id) {
                    const goal = ensureGoalExists(goal_id);
                    goal.status = 'failed';
                    goal.statusReason = statusReason || 'Marked failed by reflection';
                    const allGoalsFinishedCheck = Array.from(goalsMap.values()).every(
                        (g) => g.status === 'completed' || g.status === 'failed'
                    );
                    if (
                        allGoalsFinishedCheck &&
                        state.report.status === 'pending' &&
                        !state.agentStopReason
                    ) {
                        state.overallStatusText = `All goals processed. Preparing report...`;
                    } else if (state.report.status === 'pending' && !state.agentStopReason) {
                        state.overallStatusText = `Goal "${goal.goalTitle}" failed (${goal.statusReason}).`;
                    }
                }
                break;

            case 'agent_stop':
                state.agentStopReason =
                    statusReason || directAgentStopReason || 'Processing stopped';
                state.overallStatusText = `Agent Stopped: ${state.agentStopReason}`;
                break;

            case 'goal':
                if (!goal_id) break;
                const legacyGoal = ensureGoalExists(goal_id, directGoal || parsedData?.goal);

                if (annotationState === 'start') {
                    if (legacyGoal.status === 'pending') legacyGoal.status = 'in_progress';
                } else if (annotationState === 'search_complete') {
                    if (legacyGoal.status === 'searching') legacyGoal.status = 'analyzing';
                    else if (legacyGoal.status === 'in_progress') legacyGoal.status = 'analyzing';
                } else if (annotationState === 'complete') {
                    legacyGoal.status = 'completed';
                    legacyGoal.currentAnalysis.status = 'completed';
                    const relevantCount =
                        typeof parsedData?.relevant_results_count === 'number'
                            ? parsedData.relevant_results_count
                            : legacyGoal.relevantResultCountTotal;
                    legacyGoal.relevantResultCountTotal = relevantCount;
                } else if (annotationState === 'error') {
                    legacyGoal.status = 'failed';
                    legacyGoal.currentAnalysis.status = 'error';
                    legacyGoal.currentAnalysis.error = errorMsg;
                }
                break;

            case 'report':
                if (annotationState === 'call') {
                    state.report.status = 'in_progress';
                    state.overallStatusText = 'Generating Report...';
                } else if (annotationState === 'result') {
                    state.report.status = 'completed';
                    state.overallStatusText = 'Research Complete';
                    state.agentStopReason = state.agentStopReason || 'Report Generated';
                } else if (annotationState === 'error') {
                    state.report.status = 'error';
                    state.report.error = errorMsg;
                    state.overallStatusText = 'Report Generation Failed';
                    state.agentStopReason = 'Report Failed';
                }
                break;

            case 'info':
                if (errorMessage && !state.agentStopReason) {
                    state.overallStatusText = `Info: ${errorMessage}`;
                }
                break;
        }
    });

    state.goals = Array.from(goalsMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    if (
        state.agentStopReason &&
        state.report.status !== 'completed' &&
        state.report.status !== 'error'
    ) {
        state.overallStatusText = `Agent Stopped: ${state.agentStopReason}`;
        if (state.report.status === 'pending') state.report.status = 'stopped';
    } else if (
        state.plan.status === 'completed' &&
        state.goals.length === 0 &&
        state.report.status === 'completed'
    ) {
        state.overallStatusText = 'Research Complete (No actionable goals found).';
    } else if (state.report.status === 'completed') {
        state.overallStatusText = 'Research Complete';
    }

    return state;
}
