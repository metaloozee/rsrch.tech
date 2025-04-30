'use client';

import {
    ListIcon,
    Loader2Icon,
    MapIcon,
    SearchIcon,
    ChevronDown,
    CheckCircle2,
    XCircle,
    FileText,
    Target,
    CircleDot,
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

type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'error';

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
    relevantResultCount: number;
    uniqueResultCount: number;
    error?: string;
}

interface GoalPhaseState {
    id: string;
    status: PhaseStatus;
    goalTitle: string;
    searchQueries: SearchInfo[];
    analysis: AnalysisInfo;
    rawSearchResultsCount: number;
}

interface ReportPhaseState {
    status: PhaseStatus;
    error?: string;
}

interface WorkflowState {
    overallStatusText: string;
    hasData: boolean;
    lastSearchCall?: { query: string };
    plan: PlanPhaseState;
    goals: GoalPhaseState[];
    report: ReportPhaseState;
}

const StatusIcon = ({ status }: { status: PhaseStatus }) => {
    switch (status) {
        case 'pending':
            return <CircleDot className="size-3 text-neutral-500" />;
        case 'in_progress':
            return <Loader2Icon className="size-3 animate-spin text-blue-500" />;
        case 'completed':
            return <CheckCircle2 className="size-3 text-green-500" />;
        case 'error':
            return <XCircle className="size-3 text-red-500" />;
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
    status: PhaseStatus;
    children?: React.ReactNode;
    details?: string | React.ReactNode;
}) => {
    const IconComponent = icon;
    return (
        <div className="flex flex-col space-y-2 border-b border-neutral-800 last:border-b-0 last:pb-0">
            <div className="flex w-full justify-between items-center">
                <div className="flex gap-2 items-center">
                    <IconComponent className="size-3.5" />
                    <span className="font-medium">{title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs opacity-80">
                    <StatusIcon status={status} />
                    <span className={`capitalize ${status === 'error' ? 'text-red-400' : ''}`}>
                        {status.replace('_', ' ')}
                    </span>
                    {details && <span className="text-neutral-400 pl-1">{details}</span>}
                </div>
            </div>
            {children && <div className="pt-2">{children}</div>}
        </div>
    );
};

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
    const workflowState = extractResearchSteps(message);

    // console.log('UnifiedToolDisplay - workflowState:', safeStringify(workflowState));

    const hasAnnotations = (message as any).annotations && (message as any).annotations.length > 0;

    const hasResearchAnnotations =
        (hasAnnotations || workflowState.hasData) &&
        (workflowState.plan.status === 'in_progress' ||
            workflowState.plan.status === 'pending' ||
            workflowState.report.status === 'in_progress' ||
            workflowState.report.status === 'pending' ||
            workflowState.goals.length > 0);

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

    const tools = extractToolData(message);
    if (tools && tools.length > 0) {
        return renderResearch(tools);
    }

    return null;
};

function renderResearchWorkflow(workflowState: WorkflowState) {
    const { overallStatusText, hasData, lastSearchCall, plan, goals, report } = workflowState;

    if (!hasData) {
        return null;
    }

    const goalsInProgress = goals.filter((g) => g.status === 'in_progress').length;
    const goalsCompleted = goals.filter((g) => g.status === 'completed').length;
    const goalsError = goals.filter((g) => g.status === 'error').length;
    const goalsPending = goals.length - goalsInProgress - goalsCompleted - goalsError;

    let goalPhaseStatus: PhaseStatus = 'pending';
    if (goals.length === 0 && plan.status === 'completed') {
        goalPhaseStatus = 'completed';
    } else if (
        goalsInProgress > 0 ||
        goals.some(
            (g) =>
                g.analysis.status === 'in_progress' ||
                g.searchQueries.some((sq) => sq.status === 'in_progress')
        )
    ) {
        goalPhaseStatus = 'in_progress';
    } else if (goalsCompleted + goalsError === goals.length && goals.length > 0) {
        goalPhaseStatus = goalsError > 0 ? 'error' : 'completed';
    } else if (goalsPending === goals.length && plan.status === 'completed') {
        goalPhaseStatus = 'pending';
    } else if (plan.status === 'completed' && goals.length > 0 && goalsInProgress === 0) {
        if (goalsError > 0) goalPhaseStatus = 'error';
        else if (goalsCompleted > 0) goalPhaseStatus = 'completed';
        else goalPhaseStatus = 'pending';
    }

    const goalDetailsSummary =
        goals.length > 0 ? `(${goalsCompleted}/${goals.length} Completed)` : '(No Goals)';

    let overallStatusIconType: PhaseStatus = 'pending';
    if (report.status === 'error' || goalPhaseStatus === 'error' || plan.status === 'error') {
        overallStatusIconType = 'error';
    } else if (report.status === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (goalPhaseStatus === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (plan.status === 'in_progress') {
        overallStatusIconType = 'in_progress';
    } else if (report.status === 'completed') {
        overallStatusIconType = 'completed';
    }

    return (
        <div className="bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs mb-5">
            <Accordion className="w-full">
                <AccordionItem value="research-workflow" className="border-none">
                    <AccordionTrigger className="p-4 cursor-pointer w-full hover:bg-neutral-800/30 transition-colors rounded-t-lg">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2 items-center">
                                <MapIcon className="size-3.5" />
                                <span className="font-medium">Research Workflow</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs opacity-80">
                                <StatusIcon status={overallStatusIconType} />
                                <span>{overallStatusText}</span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-neutral-950/50 rounded-b-lg">
                        <div className="space-y-4 p-4">
                            <PhaseDisplay
                                icon={ListIcon}
                                title="Planning"
                                status={plan.status}
                                details={
                                    plan.status === 'completed'
                                        ? `(${plan.goalCount} Goals, ${plan.totalQueryCount} Queries Planned)`
                                        : undefined
                                }
                            >
                                {plan.status === 'completed' &&
                                    plan.goals &&
                                    plan.goals.length > 0 && (
                                        <div className="pt-1 space-y-1">
                                            <Disclosure>
                                                <DisclosureTrigger className="text-xs text-neutral-400 hover:text-neutral-300 flex items-center gap-1 cursor-pointer">
                                                    Show Planned Goals{' '}
                                                    <ChevronDown className="size-3" />
                                                </DisclosureTrigger>
                                                <DisclosureContent className="pt-2 space-y-1 text-xs text-neutral-400 pl-2">
                                                    {plan.goals.map((g, idx) => (
                                                        <div key={idx}>- {g.goal}</div>
                                                    ))}
                                                </DisclosureContent>
                                            </Disclosure>
                                        </div>
                                    )}
                                {plan.status === 'in_progress' && (
                                    <p className="text-xs text-neutral-400">
                                        Identifying research goals and search queries...
                                    </p>
                                )}
                                {plan.status === 'error' && (
                                    <p className="text-xs text-red-400">
                                        Failed to generate research plan.
                                    </p>
                                )}
                            </PhaseDisplay>

                            {plan.status !== 'pending' && (
                                <PhaseDisplay
                                    icon={Target}
                                    title="Goal Execution"
                                    status={goalPhaseStatus}
                                    details={goalDetailsSummary}
                                >
                                    {goalPhaseStatus === 'in_progress' &&
                                        lastSearchCall &&
                                        goals.some((g) =>
                                            g.searchQueries.some(
                                                (sq) => sq.status === 'in_progress'
                                            )
                                        ) && (
                                            <div className="flex items-center gap-2 text-xs p-1 text-neutral-400">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                <span>Searching: "{lastSearchCall.query}"...</span>
                                            </div>
                                        )}
                                    {goalPhaseStatus === 'in_progress' &&
                                        !goals.some((g) =>
                                            g.searchQueries.some(
                                                (sq) => sq.status === 'in_progress'
                                            )
                                        ) &&
                                        goals.some((g) => g.analysis.status === 'in_progress') && (
                                            <div className="flex items-center gap-2 text-xs p-1 text-neutral-400">
                                                <Loader2Icon className="size-3 animate-spin" />
                                                <span>Analyzing results...</span>
                                            </div>
                                        )}

                                    {goals.length > 0 ? (
                                        <Accordion>
                                            <div className="space-y-2 pb-4">
                                                {goals.map((goal) => {
                                                    const completedQueries =
                                                        goal.searchQueries.filter(
                                                            (q) => q.status === 'completed'
                                                        ).length;
                                                    const erroredQueries =
                                                        goal.searchQueries.filter(
                                                            (q) => q.status === 'error'
                                                        ).length;
                                                    const totalQueries = goal.searchQueries.length;

                                                    let goalStatusText = goal.status.replace(
                                                        '_',
                                                        ' '
                                                    );
                                                    if (goal.status === 'in_progress') {
                                                        if (goal.analysis.status === 'in_progress')
                                                            goalStatusText = 'Analyzing';
                                                        else if (
                                                            goal.searchQueries.some(
                                                                (q) => q.status === 'in_progress'
                                                            )
                                                        )
                                                            goalStatusText = 'Searching';
                                                        else if (
                                                            goal.searchQueries.every(
                                                                (q) =>
                                                                    q.status === 'completed' ||
                                                                    q.status === 'error'
                                                            )
                                                        )
                                                            goalStatusText = 'Pending Analysis';
                                                        else goalStatusText = 'Processing';
                                                    }

                                                    return (
                                                        <AccordionItem
                                                            key={goal.id}
                                                            value={goal.id}
                                                            className="border border-neutral-800 rounded-md bg-neutral-900/30 overflow-hidden"
                                                        >
                                                            <AccordionTrigger className="flex items-center justify-between p-2 w-full hover:bg-neutral-800/40 data-[state=open]:bg-neutral-800/40 transition-colors text-left hover:no-underline">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <StatusIcon
                                                                        status={goal.status}
                                                                    />
                                                                    <span
                                                                        className="font-medium text-xs truncate"
                                                                        title={goal.goalTitle}
                                                                    >
                                                                        {goal.goalTitle}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center flex-shrink-0 gap-2 text-[10px] text-neutral-400 ml-2">
                                                                    <span className="capitalize">
                                                                        {goalStatusText}
                                                                    </span>
                                                                    {totalQueries > 0 && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-neutral-700/50">
                                                                            {completedQueries}/
                                                                            {totalQueries} Qs
                                                                            {erroredQueries > 0 && (
                                                                                <span className="text-red-400">
                                                                                    {' '}
                                                                                    (
                                                                                    {
                                                                                        erroredQueries
                                                                                    }{' '}
                                                                                    Failed)
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    {(goal.analysis.status ===
                                                                        'completed' ||
                                                                        goal.status ===
                                                                            'completed') && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-neutral-700/50">
                                                                            {
                                                                                goal.analysis
                                                                                    .relevantResultCount
                                                                            }{' '}
                                                                            Rel.
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="text-xs bg-neutral-950/30 border-t border-neutral-800">
                                                                <div className="p-3 pt-2 space-y-3 ">
                                                                    <div>
                                                                        <span className="font-medium text-neutral-400">
                                                                            Status:{' '}
                                                                        </span>
                                                                        <span className="capitalize">
                                                                            {goalStatusText}
                                                                        </span>
                                                                        {goal.status ===
                                                                            'error' && (
                                                                            <span className="text-red-400">
                                                                                {' '}
                                                                                (Error Occurred)
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {totalQueries > 0 && (
                                                                        <div>
                                                                            <div className="font-medium text-neutral-400 mb-1">
                                                                                Search Queries (
                                                                                {completedQueries}/
                                                                                {totalQueries}):
                                                                            </div>
                                                                            <div className="flex flex-col gap-1 pl-2">
                                                                                {goal.searchQueries.map(
                                                                                    (sq) => (
                                                                                        <div
                                                                                            key={
                                                                                                sq.queryId
                                                                                            }
                                                                                            className="flex items-center gap-1.5"
                                                                                        >
                                                                                            <StatusIcon
                                                                                                status={
                                                                                                    sq.status
                                                                                                }
                                                                                            />
                                                                                            <span
                                                                                                className="text-neutral-300 truncate"
                                                                                                title={
                                                                                                    sq.query
                                                                                                }
                                                                                            >
                                                                                                {
                                                                                                    sq.query
                                                                                                }
                                                                                            </span>
                                                                                            {sq.status ===
                                                                                                'completed' &&
                                                                                                sq.resultCount !==
                                                                                                    undefined && (
                                                                                                    <span className="text-[10px] text-neutral-500 ml-1">
                                                                                                        (
                                                                                                        {
                                                                                                            sq.resultCount
                                                                                                        }{' '}
                                                                                                        results)
                                                                                                    </span>
                                                                                                )}
                                                                                            {sq.status ===
                                                                                                'error' && (
                                                                                                <span
                                                                                                    className="text-[10px] text-red-500 truncate max-w-xs ml-1"
                                                                                                    title={
                                                                                                        sq.error
                                                                                                    }
                                                                                                >
                                                                                                    {' '}
                                                                                                    -{' '}
                                                                                                    {
                                                                                                        sq.error
                                                                                                    }
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div>
                                                                        <div className="font-medium text-neutral-400 mb-1">
                                                                            Analysis:
                                                                        </div>
                                                                        <div className="pl-2 flex items-center gap-1.5">
                                                                            <StatusIcon
                                                                                status={
                                                                                    goal.analysis
                                                                                        .status
                                                                                }
                                                                            />
                                                                            <span className="capitalize text-neutral-300">
                                                                                {goal.analysis.status.replace(
                                                                                    '_',
                                                                                    ' '
                                                                                )}
                                                                            </span>
                                                                            {goal.analysis
                                                                                .status ===
                                                                                'in_progress' &&
                                                                                goal.analysis
                                                                                    .uniqueResultCount >
                                                                                    0 && (
                                                                                    <span className="text-[10px] text-neutral-500 ml-1">
                                                                                        (Processing{' '}
                                                                                        {
                                                                                            goal
                                                                                                .analysis
                                                                                                .uniqueResultCount
                                                                                        }{' '}
                                                                                        unique
                                                                                        sources)
                                                                                    </span>
                                                                                )}
                                                                            {(goal.analysis
                                                                                .status ===
                                                                                'completed' ||
                                                                                goal.status ===
                                                                                    'completed') && (
                                                                                <span className="text-[10px] text-neutral-500 ml-1">
                                                                                    (
                                                                                    {
                                                                                        goal
                                                                                            .analysis
                                                                                            .relevantResultCount
                                                                                    }{' '}
                                                                                    relevant sources
                                                                                    found)
                                                                                </span>
                                                                            )}
                                                                            {goal.analysis
                                                                                .status ===
                                                                                'error' && (
                                                                                <span
                                                                                    className="text-[10px] text-red-500 truncate max-w-xs ml-1"
                                                                                    title={
                                                                                        goal
                                                                                            .analysis
                                                                                            .error
                                                                                    }
                                                                                >
                                                                                    {' '}
                                                                                    -{' '}
                                                                                    {
                                                                                        goal
                                                                                            .analysis
                                                                                            .error
                                                                                    }
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    );
                                                })}
                                            </div>
                                        </Accordion>
                                    ) : (
                                        <p className="text-xs text-neutral-500 pl-5 pt-1">
                                            {plan.status === 'completed'
                                                ? 'No goals to execute.'
                                                : 'Waiting for planning phase...'}
                                        </p>
                                    )}
                                </PhaseDisplay>
                            )}

                            {(goalPhaseStatus === 'completed' ||
                                goalPhaseStatus === 'error' ||
                                report.status !== 'pending') &&
                                plan.status === 'completed' && (
                                    <PhaseDisplay
                                        icon={FileText}
                                        title="Report Generation"
                                        status={report.status}
                                    >
                                        {report.status === 'in_progress' && (
                                            <p className="text-xs text-neutral-400">
                                                Compiling findings into the final report...
                                            </p>
                                        )}
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
                                    <Loader2Icon className="size-3 animate-spin" />
                                    <span>
                                        {isLoading ? 'Searching...' : 'Processing results...'}
                                    </span>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="flex flex-col items-center justify-center p-4 gap-2">
                                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
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

function extractResearchSteps(message: Message): WorkflowState {
    const initialGoal: Omit<GoalPhaseState, 'id' | 'goalTitle'> = {
        status: 'pending',
        searchQueries: [],
        analysis: {
            status: 'pending',
            relevantResultCount: 0,
            uniqueResultCount: 0,
        },
        rawSearchResultsCount: 0,
    };

    const state: WorkflowState = {
        overallStatusText: 'Initializing Research...',
        hasData: false,
        plan: { status: 'pending', goalCount: 0, totalQueryCount: 0 },
        goals: [],
        report: { status: 'pending' },
    };

    const goalsMap = new Map<string, GoalPhaseState>();

    if (!(message.role === 'assistant' && (message as any).annotations)) {
        const tools = extractToolData(message);
        if (tools.length > 0) {
            state.hasData = true;
            state.overallStatusText = 'Processing research data...';
        } else {
            return state;
        }
    }

    const annotations = (message as any).annotations || [];
    if (annotations.length > 0) state.hasData = true;

    if (!state.hasData) return state;

    // annotations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    annotations.forEach((annotation: any) => {
        const {
            type,
            state: annotationState,
            goal_id,
            query_id,
            data: annotationData,
            goal: directGoal,
            queries: directQueries,
            count: planGoalCount,
            total_search_queries: planTotalQueries,
            query: directQuery,
            unique_results_count: analysisUniqueCount,
            relevant_results_count: goalRelevantCount,
            raw_search_results_count: goalRawSearchCount,
            error: directError,
            message: errorMessage,
        } = annotation;

        const errorMsg = directError || errorMessage || annotationData?.error || 'Unknown error';

        switch (type) {
            case 'plan':
                if (annotationState === 'call') {
                    state.plan.status = 'in_progress';
                    state.overallStatusText = 'Planning Research...';
                } else if (annotationState === 'result') {
                    state.plan.status = 'completed';
                    state.plan.goalCount = planGoalCount || annotationData?.count || 0;
                    state.plan.totalQueryCount =
                        planTotalQueries || annotationData?.total_search_queries || 0;
                    state.plan.goals = annotationData?.data || [];
                    state.overallStatusText = `Plan Complete: ${state.plan.goalCount} Goals, ${state.plan.totalQueryCount} Queries`;
                    if (state.plan.goals && state.plan.goals.length > 0) {
                        state.plan.goals.forEach((goalData, index) => {
                            const gid = `goal_${index + 1}`;
                            if (!goalsMap.has(gid)) {
                                goalsMap.set(gid, {
                                    ...initialGoal,
                                    id: gid,
                                    goalTitle: goalData.goal || `Goal ${index + 1}`,
                                    searchQueries: (goalData.search_queries || []).map(
                                        (q, qIdx) => ({
                                            queryId: `${gid}_query_${qIdx + 1}`,
                                            query: q,
                                            status: 'pending',
                                        })
                                    ),
                                });
                            } else {
                                const existingGoal = goalsMap.get(gid)!;
                                existingGoal.goalTitle = goalData.goal || existingGoal.goalTitle;
                                const existingQueries = new Map(
                                    existingGoal.searchQueries.map((q) => [q.queryId, q])
                                );
                                (goalData.search_queries || []).forEach((q, qIdx) => {
                                    const queryId = `${gid}_query_${qIdx + 1}`;
                                    if (!existingQueries.has(queryId)) {
                                        existingGoal.searchQueries.push({
                                            queryId: queryId,
                                            query: q,
                                            status: 'pending',
                                        });
                                    }
                                });
                            }
                        });
                    } else if (state.plan.goalCount === 0) {
                        state.overallStatusText = 'No research goals identified.';
                        state.report.status = 'completed';
                    }
                } else if (annotationState === 'error') {
                    state.plan.status = 'error';
                    state.overallStatusText = `Planning Failed: ${errorMsg}`;
                }
                break;

            case 'goal':
                if (!goal_id) break;
                if (!goalsMap.has(goal_id)) {
                    goalsMap.set(goal_id, {
                        ...initialGoal,
                        id: goal_id,
                        goalTitle: directGoal || `Goal ${goal_id.split('_')[1]}`,
                    });
                }
                const currentGoal = goalsMap.get(goal_id)!;

                if (annotationState === 'start') {
                    currentGoal.status = 'in_progress';
                    currentGoal.goalTitle =
                        directGoal || annotationData?.goal || currentGoal.goalTitle;
                    const goalQueries = directQueries || annotationData?.queries || [];
                    const existingQueriesMap = new Map(
                        currentGoal.searchQueries.map((sq) => [sq.queryId, sq])
                    );
                    currentGoal.searchQueries = goalQueries.map((q: string, qIdx: number) => {
                        const qid = `${goal_id}_query_${qIdx + 1}`;
                        const existing = existingQueriesMap.get(qid);
                        return {
                            queryId: qid,
                            query: q,
                            status: existing?.status || 'pending',
                            resultCount: existing?.resultCount,
                            error: existing?.error,
                        };
                    });
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Executing Goal: ${currentGoal.goalTitle}...`;
                    }
                } else if (annotationState === 'search_complete') {
                    currentGoal.rawSearchResultsCount =
                        goalRawSearchCount ||
                        annotationData?.raw_search_results_count ||
                        currentGoal.rawSearchResultsCount;
                    currentGoal.searchQueries.forEach((sq) => {
                        if (sq.status === 'in_progress') sq.status = 'completed';
                    });
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Analyzing Goal: ${currentGoal.goalTitle}...`;
                    }
                } else if (annotationState === 'complete') {
                    currentGoal.status = 'completed';
                    currentGoal.analysis.status = 'completed';
                    currentGoal.analysis.relevantResultCount =
                        goalRelevantCount ||
                        annotationData?.relevant_results_count ||
                        currentGoal.analysis.relevantResultCount;
                    const allGoalsFinished = Array.from(goalsMap.values()).every(
                        (g) => g.status === 'completed' || g.status === 'error'
                    );
                    if (allGoalsFinished && state.report.status === 'pending') {
                        state.overallStatusText = 'Goal Execution Complete';
                    } else if (state.report.status === 'pending') {
                        state.overallStatusText = `Goal Complete: ${currentGoal.goalTitle}`;
                    }
                } else if (annotationState === 'error') {
                    currentGoal.status = 'error';
                    currentGoal.analysis.status = 'error';
                    currentGoal.analysis.error = errorMsg;
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Error in Goal: ${currentGoal.goalTitle}`;
                    }
                }
                break;

            case 'search':
                if (!goal_id || !query_id) break;
                if (!goalsMap.has(goal_id)) {
                    goalsMap.set(goal_id, {
                        ...initialGoal,
                        id: goal_id,
                        goalTitle: `Goal ${goal_id.split('_')[1]}`,
                    });
                }
                const searchGoal = goalsMap.get(goal_id)!;
                let searchQuery = searchGoal.searchQueries.find((sq) => sq.queryId === query_id);

                const queryText = directQuery || annotationData?.query;

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
                        `Search annotation received for unknown queryId ${query_id} in goal ${goal_id}`
                    );
                    break;
                }

                if (searchGoal.status === 'completed' || searchGoal.status === 'error') break;

                if (annotationState === 'call') {
                    searchQuery.status = 'in_progress';
                    searchGoal.status = 'in_progress';
                    state.lastSearchCall = { query: searchQuery.query };
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Searching: \"${searchQuery.query}\"...`;
                    }
                } else if (annotationState === 'result') {
                    searchQuery.status = 'completed';
                    searchQuery.resultCount =
                        typeof annotationData?.resultCount === 'number'
                            ? annotationData.resultCount
                            : 0;
                    state.lastSearchCall = undefined;
                    const allSearchesDone = searchGoal.searchQueries.every(
                        (sq) => sq.status === 'completed' || sq.status === 'error'
                    );
                    if (
                        allSearchesDone &&
                        searchGoal.analysis.status === 'pending' &&
                        state.report.status === 'pending'
                    ) {
                        state.overallStatusText = `Analyzing Goal: ${searchGoal.goalTitle}...`;
                    }
                } else if (annotationState === 'error') {
                    searchQuery.status = 'error';
                    searchQuery.error = errorMsg;
                    searchGoal.status = 'in_progress';
                    state.lastSearchCall = undefined;
                    const allSearchesDone = searchGoal.searchQueries.every(
                        (sq) => sq.status === 'completed' || sq.status === 'error'
                    );
                    if (
                        allSearchesDone &&
                        searchGoal.analysis.status === 'pending' &&
                        state.report.status === 'pending'
                    ) {
                        state.overallStatusText = `Analyzing Goal: ${searchGoal.goalTitle}...`;
                    }
                }
                break;

            case 'analysis':
                if (!goal_id) break;
                if (!goalsMap.has(goal_id)) {
                    goalsMap.set(goal_id, {
                        ...initialGoal,
                        id: goal_id,
                        goalTitle: `Goal ${goal_id.split('_')[1]}`,
                    });
                }
                const analysisGoal = goalsMap.get(goal_id)!;

                if (analysisGoal.status === 'completed' || analysisGoal.status === 'error') break;

                if (annotationState === 'call') {
                    analysisGoal.analysis.status = 'in_progress';
                    analysisGoal.status = 'in_progress';
                    analysisGoal.analysis.uniqueResultCount =
                        typeof analysisUniqueCount === 'number'
                            ? analysisUniqueCount
                            : typeof annotationData?.unique_results_count === 'number'
                              ? annotationData.unique_results_count
                              : analysisGoal.analysis.uniqueResultCount;
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Analyzing ${analysisGoal.analysis.uniqueResultCount} results for: ${analysisGoal.goalTitle}...`;
                    }
                } else if (annotationState === 'result') {
                    analysisGoal.analysis.status = 'in_progress';
                    analysisGoal.status = 'in_progress';
                } else if (annotationState === 'error') {
                    analysisGoal.analysis.status = 'error';
                    analysisGoal.analysis.error = errorMsg;
                    analysisGoal.status = 'error';
                    if (state.report.status === 'pending') {
                        state.overallStatusText = `Analysis Error for: ${analysisGoal.goalTitle}`;
                    }
                }
                break;

            case 'report':
                if (annotationState === 'call') {
                    state.report.status = 'in_progress';
                    state.overallStatusText = 'Generating Report...';
                } else if (annotationState === 'result') {
                    state.report.status = 'completed';
                    state.overallStatusText = 'Research Complete';
                } else if (annotationState === 'error') {
                    state.report.status = 'error';
                    state.report.error = errorMsg;
                    state.overallStatusText = 'Report Generation Failed';
                }
                break;
        }
    });

    state.goals = Array.from(goalsMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    const allGoalsFinished =
        state.goals.length > 0 &&
        state.goals.every((g) => g.status === 'completed' || g.status === 'error');
    if (allGoalsFinished && state.report.status === 'pending') {
        state.overallStatusText = 'Synthesizing Findings...';
    } else if (
        state.plan.status === 'completed' &&
        state.goals.length === 0 &&
        state.report.status === 'pending'
    ) {
        state.overallStatusText = 'No research goals identified.';
        state.report.status = 'completed';
    }

    return state;
}

function normalizeUrl(url: string): string {
    if (typeof url !== 'string') return '';
    try {
        return url
            .trim()
            .toLowerCase()
            .replace(/\/$/, '')
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '');
    } catch {
        return url;
    }
}
