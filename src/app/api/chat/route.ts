import { z } from 'zod';
import {
    convertToCoreMessages,
    createDataStreamResponse,
    generateText,
    NoSuchToolError,
    smoothStream,
    streamText,
    tool,
    Message,
    generateObject,
} from 'ai';
import { ResponseMode } from '@/components/chat-input';

import { env } from '@/lib/env';
import { tavily } from '@tavily/core';
import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';

import { mistral } from '@ai-sdk/mistral';
import crypto from 'crypto';

export const maxDuration = 60;

const tvly = tavily({ apiKey: env.TAVILY_API_KEY });

const highReasoningModel = mistral('mistral-large-latest');
const lowReasoningModel = mistral('mistral-small-latest');

// const highReasoningModel = google('gemini-2.5-pro-exp-03-25');
// const lowReasoningModel = google('gemini-2.5-flash-preview-04-17');

// const highReasoningModel = anthropic('claude-3-7-sonnet-20250219');
// const lowReasoningModel = anthropic('claude-3-7-sonnet-20250219');

export interface SearchResult {
    reason: string;
    query: string;
    result: any;
    error?: any;
}

function createResultsHash(results: any[]): string {
    if (!results || !Array.isArray(results) || results.length === 0) {
        return 'empty';
    }
    const sortedResults = [...results].sort((a, b) => (a?.url || '').localeCompare(b?.url || ''));
    const stringified = JSON.stringify(sortedResults);
    return crypto.createHash('md5').update(stringified).digest('hex');
}

interface Goal {
    id: string;
    goal: string;
    search_queries: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    relevant_results: SearchResult[];
    searches_attempted: number;
}

export async function POST(req: Request) {
    try {
        const {
            messages,
            id,
            responseMode,
        }: {
            messages: Message[];
            id: string;
            responseMode: ResponseMode;
        } = await req.json();

        if (!messages || !id || !responseMode) {
            throw new Error('Invalid Body');
        }

        const originalQuery =
            messages.length > 0 ? messages[messages.length - 1].content : 'No query found.';

        return createDataStreamResponse({
            async execute(dataStream) {
                const MAX_ITERATIONS = responseMode === 'research' ? 20 : 5;
                const MAX_GOALS = responseMode === 'research' ? 10 : 3;
                const MAX_SEARCHES_PER_GOAL = responseMode === 'research' ? 3 : 1;

                let iteration = 0;
                let activeGoals: Goal[] = [];
                let completedGoals: Goal[] = [];
                let gatheredInformation: SearchResult[] = []; // Combined relevant results
                let researchHistory: string[] = []; // Log of actions

                dataStream.writeMessageAnnotation({
                    type: 'agent_init',
                    state: 'start',
                });

                dataStream.writeMessageAnnotation({ type: 'plan', state: 'call' });
                const initialPlanSchema = z.object({
                    initial_goals: z
                        .array(
                            z.object({
                                goal: z.string().describe('A high-level initial research goal.'),
                                initial_search_queries: z
                                    .array(z.string())
                                    .min(1)
                                    .max(responseMode === 'research' ? 3 : 2)
                                    .describe('Initial search queries for this goal.'),
                            })
                        )
                        .min(1)
                        .max(responseMode === 'research' ? 2 : 1)
                        .describe('High-level initial research goals based on the query.'),
                });

                let initialPlanData;
                try {
                    const { object } = await generateObject({
                        model: lowReasoningModel,
                        providerOptions: {
                            google: {} satisfies GoogleGenerativeAIProviderOptions,
                        },
                        output: 'object',
                        schema: initialPlanSchema,
                        messages: convertToCoreMessages(messages),
                        system: `
You are a Research Strategist starting an investigation. Analyze the user's request and define 1-2 high-level initial research goals. 
For each goal, suggest ${responseMode === 'research' ? '1-3' : '1'} focused search query to kickstart the process. Keep goals broad initially.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

INSTRUCTIONS:
1. Identify the core topic and implicit questions in the user request.
2. Formulate ${responseMode === 'research' ? '1-2' : '1'} broad, actionable initial goals.
3. For each goal, generate ${responseMode === 'research' ? '1-3' : '1'} targeted search queries suitable for a search engine.

Respond ONLY with the JSON object matching the schema.
`,
                    });
                    initialPlanData = object;

                    activeGoals = initialPlanData.initial_goals.map((g, i) => ({
                        id: `goal_${i + 1}`,
                        goal: g.goal,
                        search_queries: g.initial_search_queries,
                        status: 'pending',
                        relevant_results: [],
                        searches_attempted: 0,
                    }));

                    dataStream.writeMessageAnnotation({
                        type: 'plan',
                        state: 'result',
                        count: activeGoals.length,
                        data: activeGoals.map((g) => ({
                            goal: g.goal,
                            queries: g.search_queries,
                        })),
                        total_search_queries: activeGoals.reduce(
                            (sum, g) => sum + g.search_queries.length,
                            0
                        ),
                    });
                    researchHistory.push(
                        `Initial plan created with goals: ${activeGoals.map((g) => g.goal).join(', ')}`
                    );
                } catch (error: any) {
                    console.error('Initial planning failed:', error);
                    dataStream.writeMessageAnnotation({
                        type: 'plan',
                        state: 'error',
                        error: error.message || 'Failed to generate initial plan.',
                    });
                    researchHistory.push(`Error during initial planning: ${error.message}`);
                    return;
                }

                while (
                    activeGoals.length > 0 &&
                    iteration < MAX_ITERATIONS &&
                    completedGoals.length + activeGoals.length <= MAX_GOALS
                ) {
                    iteration++;
                    const currentGoal = activeGoals.shift();

                    if (!currentGoal) break;

                    currentGoal.status = 'in_progress';
                    const goalId = currentGoal.id;

                    dataStream.writeMessageAnnotation({
                        type: 'goal_iteration',
                        iteration: iteration,
                        goal_id: goalId,
                        state: 'start',
                        goal: currentGoal.goal,
                        remaining_active_goals: activeGoals.length,
                        completed_goals: completedGoals.length,
                    });
                    researchHistory.push(
                        `Starting iteration ${iteration} for goal: ${currentGoal.goal}`
                    );

                    const queriesToRun = currentGoal.search_queries.slice(
                        currentGoal.searches_attempted,
                        currentGoal.searches_attempted + 1
                    );

                    if (queriesToRun.length > 0) {
                        dataStream.writeMessageAnnotation({
                            type: 'search_batch',
                            goal_id: goalId,
                            state: 'start',
                            queries: queriesToRun,
                        });

                        const searchPromises = queriesToRun.map(async (queryItem, idx) => {
                            const queryIndex = currentGoal.searches_attempted + idx;
                            const queryId = `${goalId}_query_${queryIndex + 1}`;
                            dataStream.writeMessageAnnotation({
                                type: 'search',
                                goal_id: goalId,
                                query_id: queryId,
                                state: 'call',
                                query: queryItem,
                            });
                            try {
                                const res = await tvly.search(queryItem, {
                                    maxResults: 2,
                                    searchDepth: responseMode === 'concise' ? 'basic' : 'advanced',
                                });
                                const resultData = {
                                    query: queryItem,
                                    result: res,
                                };
                                dataStream.writeMessageAnnotation({
                                    type: 'search',
                                    goal_id: goalId,
                                    query_id: queryId,
                                    state: 'result',
                                    data: {
                                        query: queryItem,
                                        resultCount: res?.results?.length ?? 0,
                                    },
                                });
                                researchHistory.push(`Search successful for query: ${queryItem}`);
                                return resultData;
                            } catch (error: any) {
                                console.error(`Search failed for query '${queryItem}':`, error);
                                const errorData = {
                                    query: queryItem,
                                    error: error.message || 'Unknown search error',
                                };
                                dataStream.writeMessageAnnotation({
                                    type: 'search',
                                    goal_id: goalId,
                                    query_id: queryId,
                                    state: 'error',
                                    data: errorData,
                                });
                                researchHistory.push(
                                    `Search failed for query: ${queryItem}: ${error.message}`
                                );
                                return errorData;
                            }
                        });

                        const rawQueryResponses = await Promise.all(searchPromises);
                        currentGoal.searches_attempted += queriesToRun.length;

                        const uniqueResultsMap = new Map<string, SearchResult>();
                        for (const response of rawQueryResponses) {
                            if ('error' in response || !response.result) continue;
                            const intraDedupedResult = deduplicateSearchResults(response.result);
                            if (
                                !intraDedupedResult.results ||
                                intraDedupedResult.results.length === 0
                            )
                                continue;

                            const resultsHash = createResultsHash(intraDedupedResult.results);
                            if (!uniqueResultsMap.has(resultsHash)) {
                                uniqueResultsMap.set(resultsHash, {
                                    reason: '',
                                    query: response.query,
                                    result: intraDedupedResult,
                                });
                            }
                        }

                        dataStream.writeMessageAnnotation({
                            type: 'analysis',
                            goal_id: goalId,
                            state: 'call',
                            unique_results_count: uniqueResultsMap.size,
                        });
                        researchHistory.push(
                            `Analyzing ${uniqueResultsMap.size} unique search results for relevance to goal: ${currentGoal.goal}`
                        );

                        const newRelevantSearchResults: SearchResult[] = [];
                        const analysisPromises = Array.from(uniqueResultsMap.values()).map(
                            async (uniqueSearchResult) => {
                                try {
                                    const { object: searchAnalysis } = await generateObject({
                                        model: lowReasoningModel,
                                        output: 'object',
                                        schema: z.object({
                                            isRelevant: z
                                                .boolean()
                                                .describe(
                                                    'Whether the result is directly relevant to the current specific goal'
                                                ),
                                            reason: z
                                                .string()
                                                .describe('Brief reason for relevance/irrelevance'),
                                            newAngleFound: z
                                                .boolean()
                                                .describe(
                                                    'Does this result suggest a new, potentially important angle not covered by current goals?'
                                                ),
                                            newAngleDescription: z
                                                .string()
                                                .optional()
                                                .describe(
                                                    'If new angle found, briefly describe it.'
                                                ),
                                        }),
                                        prompt: `
Analyze the following search result for relevance to the *specific* research goal and identify potential new research directions.

<search-results>
${JSON.stringify(uniqueSearchResult.result)}
</search-results>

<current-research-goal>
${currentGoal.goal}
</current-research-goal>

Return ONLY the JSON object.`,
                                    });

                                    dataStream.writeMessageAnnotation({
                                        type: 'analysis_result',
                                        goal_id: goalId,
                                        state: 'result',
                                        query: uniqueSearchResult.query,
                                        isRelevant: searchAnalysis.isRelevant,
                                        newAngleFound: searchAnalysis.newAngleFound,
                                        data: JSON.stringify({
                                            reason: searchAnalysis.reason,
                                            new_angle: searchAnalysis.newAngleDescription,
                                        }),
                                    });

                                    if (searchAnalysis.isRelevant) {
                                        uniqueSearchResult.reason = searchAnalysis.reason;
                                        newRelevantSearchResults.push(uniqueSearchResult);
                                        researchHistory.push(
                                            `Result relevant for query ${uniqueSearchResult.query}: ${searchAnalysis.reason}`
                                        );
                                    } else {
                                        researchHistory.push(
                                            `Result not relevant for query ${uniqueSearchResult.query}: ${searchAnalysis.reason}`
                                        );
                                    }

                                    return { ...uniqueSearchResult, analysis: searchAnalysis };
                                } catch (error: any) {
                                    console.error(
                                        `Analysis failed for goal '${currentGoal.goal}', query '${uniqueSearchResult.query}':`,
                                        error
                                    );
                                    dataStream.writeMessageAnnotation({
                                        type: 'analysis',
                                        goal_id: goalId,
                                        state: 'error',
                                        query: uniqueSearchResult.query,
                                        error: error.message || 'Analysis error',
                                    });
                                    researchHistory.push(
                                        `Analysis failed for query ${uniqueSearchResult.query}: ${error.message}`
                                    );
                                    return null;
                                }
                            }
                        );

                        const analysisResultsWithAngles = (
                            await Promise.all(analysisPromises)
                        ).filter(Boolean);
                        currentGoal.relevant_results.push(...newRelevantSearchResults);
                        gatheredInformation.push(...newRelevantSearchResults);

                        dataStream.writeMessageAnnotation({
                            type: 'goal_progress',
                            goal_id: goalId,
                            relevant_found_this_iteration: newRelevantSearchResults.length,
                            total_relevant_for_goal: currentGoal.relevant_results.length,
                            searches_attempted_for_goal: currentGoal.searches_attempted,
                        });

                        dataStream.writeMessageAnnotation({
                            type: 'reflection',
                            goal_id: goalId,
                            state: 'call',
                        });
                        researchHistory.push(
                            `Reflecting on findings for goal: ${currentGoal.goal}`
                        );

                        const reflectionSchema = z.object({
                            shouldAddNewGoals: z
                                .boolean()
                                .describe(
                                    "Based *only* on the 'newAngleFound' flags and descriptions in the recent analysis, are there significant new research directions worth pursuing?"
                                ),
                            newGoals: z
                                .array(
                                    z.object({
                                        goal: z
                                            .string()
                                            .describe(
                                                'A concise new research goal derived from a discovered angle.'
                                            ),
                                        initial_search_queries: z
                                            .array(z.string())
                                            .min(1)
                                            .max(2)
                                            .describe(
                                                '1-2 specific search queries for this new goal.'
                                            ),
                                    })
                                )
                                .optional()
                                .describe(
                                    'List of new goals and queries, ONLY if shouldAddNewGoals is true.'
                                ),
                            assessmentOfCurrentGoal: z
                                .enum(['completed', 'needs_more_searches', 'failed'])
                                .describe(
                                    `Based on relevance and searches attempted: Is the current goal ('${currentGoal.goal}') satisfactorily completed, needs more searches (if queries remain and searches attempted < MAX_SEARCHES_PER_GOAL), or should be marked failed (e.g., no relevant results after sufficient searches)?`
                                ),
                            nextActionSuggestion: z
                                .string()
                                .describe(
                                    "Brief suggestion for the overall *next* step (e.g., 'Proceed with next goal', 'Add new goals and prioritize', 'Generate final report')."
                                ),
                        });

                        try {
                            const { object: reflectionResult } = await generateObject({
                                model: lowReasoningModel,
                                schema: reflectionSchema,
                                output: 'object',
                                prompt: `
You are a Research Agent reflecting on the latest findings to adapt the research plan.

Current Goal: ${currentGoal.goal} (Searches Attempted: ${currentGoal.searches_attempted}/${MAX_SEARCHES_PER_GOAL})
Total Relevant Results Found for this Goal: ${currentGoal.relevant_results.length}

Recent Analysis Summary (Highlights potential new angles):
${
    analysisResultsWithAngles
        .filter((r) => r?.analysis?.newAngleFound)
        .map((r) => `- Query "${r?.query}": New Angle: ${r?.analysis?.newAngleDescription}`)
        .join('\n') || '- No significant new angles identified in this batch.'
}

All Active Goals (excluding current):
${activeGoals.map((g) => `- ${g.goal} (Status: ${g.status})`).join('\n') || '- None'}

Completed Goals:
${completedGoals.map((g) => `- ${g.goal}`).join('\n') || '- None'}

Max Searches Per Goal: ${MAX_SEARCHES_PER_GOAL}

INSTRUCTIONS:
1. Evaluate the 'newAngleFound' information. Should genuinely new, distinct goals be added? Avoid redundancy with existing active/completed goals.
2. Assess the current goal's status. Is it done, or does it need more focused searches (if search budget allows)? Mark failed if unproductive.
3. Propose the next logical action for the overall research process.

Respond ONLY with the JSON object matching the schema.`,
                            });

                            dataStream.writeMessageAnnotation({
                                type: 'reflection',
                                goal_id: goalId,
                                state: 'result',
                                data: reflectionResult,
                            });
                            researchHistory.push(
                                `Reflection Result: Add Goals: ${reflectionResult.shouldAddNewGoals}, Current Goal Status: ${reflectionResult.assessmentOfCurrentGoal}, Next Action: ${reflectionResult.nextActionSuggestion}`
                            );

                            if (reflectionResult.shouldAddNewGoals && reflectionResult.newGoals) {
                                const newGoalCount =
                                    completedGoals.length +
                                    activeGoals.length +
                                    1 +
                                    reflectionResult.newGoals.length;
                                if (newGoalCount <= MAX_GOALS) {
                                    const nextGoalId =
                                        completedGoals.length + activeGoals.length + 1;
                                    reflectionResult.newGoals.forEach((newGoal, i) => {
                                        const newGoalObj: Goal = {
                                            id: `goal_${nextGoalId + i}`,
                                            goal: newGoal.goal,
                                            search_queries: newGoal.initial_search_queries,
                                            status: 'pending',
                                            relevant_results: [],
                                            searches_attempted: 0,
                                        };
                                        activeGoals.push(newGoalObj);
                                        dataStream.writeMessageAnnotation({
                                            type: 'goal_add',
                                            goal_id: newGoalObj.id,
                                            goal: newGoalObj.goal,
                                        });
                                        researchHistory.push(`Adding new goal: ${newGoalObj.goal}`);
                                    });
                                } else {
                                    dataStream.writeMessageAnnotation({
                                        type: 'info',
                                        message:
                                            'Max goals reached, skipping addition of new goals.',
                                    });
                                    researchHistory.push(
                                        'Skipped adding new goals due to MAX_GOALS limit.'
                                    );
                                }
                            }

                            switch (reflectionResult.assessmentOfCurrentGoal) {
                                case 'completed':
                                    currentGoal.status = 'completed';
                                    completedGoals.push(currentGoal);
                                    dataStream.writeMessageAnnotation({
                                        type: 'goal_complete',
                                        goal_id: goalId,
                                        reason: 'Marked complete by reflection',
                                    });
                                    researchHistory.push(
                                        `Goal marked completed: ${currentGoal.goal}`
                                    );
                                    break;
                                case 'needs_more_searches':
                                    if (
                                        currentGoal.searches_attempted < MAX_SEARCHES_PER_GOAL &&
                                        currentGoal.search_queries.length >
                                            currentGoal.searches_attempted
                                    ) {
                                        currentGoal.status = 'pending';
                                        activeGoals.unshift(currentGoal);
                                        dataStream.writeMessageAnnotation({
                                            type: 'goal_requeue',
                                            goal_id: goalId,
                                            reason: 'Needs more searches',
                                        });
                                        researchHistory.push(
                                            `Goal requeued for more searches: ${currentGoal.goal}`
                                        );
                                    } else {
                                        currentGoal.status = 'completed';
                                        completedGoals.push(currentGoal);
                                        dataStream.writeMessageAnnotation({
                                            type: 'goal_complete',
                                            goal_id: goalId,
                                            reason: 'Search budget exhausted',
                                        });
                                        researchHistory.push(
                                            `Goal marked completed (search budget exhausted): ${currentGoal.goal}`
                                        );
                                    }
                                    break;
                                case 'failed':
                                    currentGoal.status = 'failed';
                                    completedGoals.push(currentGoal);
                                    dataStream.writeMessageAnnotation({
                                        type: 'goal_fail',
                                        goal_id: goalId,
                                        reason: 'Marked failed by reflection',
                                    });
                                    researchHistory.push(`Goal marked failed: ${currentGoal.goal}`);
                                    break;
                            }
                        } catch (error: any) {
                            console.error(
                                `Reflection failed for goal '${currentGoal.goal}':`,
                                error
                            );
                            dataStream.writeMessageAnnotation({
                                type: 'reflection',
                                goal_id: goalId,
                                state: 'error',
                                error: error.message || 'Reflection error',
                            });
                            researchHistory.push(
                                `Reflection failed: ${error.message}. Marking goal completed.`
                            );
                            currentGoal.status = 'completed';
                            completedGoals.push(currentGoal);
                        }
                    } else {
                        currentGoal.status = 'completed';
                        completedGoals.push(currentGoal);
                        dataStream.writeMessageAnnotation({
                            type: 'goal_complete',
                            goal_id: goalId,
                            reason: 'All queries attempted',
                        });
                        researchHistory.push(
                            `Goal marked completed (all queries attempted): ${currentGoal.goal}`
                        );
                    }
                }

                if (iteration >= MAX_ITERATIONS) {
                    dataStream.writeMessageAnnotation({
                        type: 'agent_stop',
                        reason: 'Max iterations reached',
                    });
                    researchHistory.push('Agent stopped: Max iterations reached.');
                } else if (
                    completedGoals.length + activeGoals.length >= MAX_GOALS &&
                    activeGoals.length > 0
                ) {
                    dataStream.writeMessageAnnotation({
                        type: 'agent_stop',
                        reason: 'Max goals reached',
                    });
                    researchHistory.push('Agent stopped: Max goals reached.');
                    completedGoals.push(...activeGoals);
                    activeGoals = [];
                } else {
                    dataStream.writeMessageAnnotation({
                        type: 'agent_stop',
                        reason: 'All active goals processed',
                    });
                    researchHistory.push('Agent stopped: All goals processed.');
                }

                const finalDedupedRelevantResults = deduplicateRelevantResults(gatheredInformation);

                dataStream.writeMessageAnnotation({
                    type: 'report',
                    state: 'call',
                    final_results_count: finalDedupedRelevantResults.length,
                    total_iterations: iteration,
                    research_summary: researchHistory,
                });

                if (finalDedupedRelevantResults.length === 0) {
                    dataStream.writeMessageAnnotation({ type: 'report', state: 'result' });

                    /*
                     * Let the final prompt handle the no-results case, or stream a simple message
                     * For simplicity, let the final LLM call generate the "no results" message.
                     * dataStream.write(...); Cannot directly write plain text this way easily
                     * dataStream.close(); Close handled by finalResponse.mergeIntoDataStream
                     * return;
                     */
                }

                const finalResponse = await streamText({
                    model: highReasoningModel,
                    providerOptions: {
                        anthropic: {
                            thinking: { type: 'enabled', budgetTokens: 12000 },
                        } satisfies AnthropicProviderOptions,
                        google: {
                            thinkingConfig: { thinkingBudget: 12000 },
                        } satisfies GoogleGenerativeAIProviderOptions,
                    },
                    experimental_transform: smoothStream(),
                    onError: ({ error }) => {
                        console.error('Error Occurred in Final Report Generation: ', error);
                        dataStream.writeMessageAnnotation({
                            type: 'report',
                            state: 'error',
                            error:
                                (error as Error).message ||
                                'Unknown error during report generation',
                        });
                    },
                    prompt:
                        responseMode === 'research'
                            ? `
You are an elite investigative journalist crafting a report based on findings gathered through an iterative research process. The provided context contains relevant search results accumulated across potentially evolving research goals.

Your task is to synthesize these findings into a compelling, well-structured narrative (like a New York Times article), determining the best structure based on the *content* rather than a fixed template, while ensuring the report directly addresses the **Original User Query**.

Instructions:

1.  **Analyze Context & Query:** Review the **Original Query** and the \`Context\` (relevant search results).
2.  **Determine Structure:** Decide the most logical structure (thematic, chronological, etc.) for *this specific information* to best answer the query.
3.  **Craft Headline & Overview:** Write a strong headline and a concise opening paragraph summarizing the key findings and their significance *in relation to the query*.
4.  **Develop Body:** Organize the main content according to your chosen structure using descriptive Markdown headings (\`## Section Title\`). Weave in facts, quotes, and data from the \`Context\`, ensuring smooth flow and relevance to the query.
5.  **Maintain Style:** Write clearly, objectively, and engagingly. Explain complex points simply. Present balanced perspectives if conflicts exist.
6.  **Cite Everything:** Support *all* factual claims, stats, and quotes with inline citations \`[Source Title](URL)\` immediately after the relevant sentence/paragraph. Use the exact titles and URLs from the \`Context\`.
7.  **Conclude:** Write a \`## Conclusion\` summarizing the main takeaways and significance based *only* on the report's content and the \`Context\`, directly addressing the **Original User Query**. Briefly discuss implications or future outlook if supported by the context.

Formatting:

*   Use Markdown. Use tables if helpful.
*   Use \`$\` for inline math, \`$$\` for block math (not currency).
*   Position \`[Source Title](URL)\` citations accurately.
*   Use descriptive source titles and exact URLs from the \`Context\`.
*   In case of currency, use \`USD\`, \`INR\` or another relevant currency code but not the symbol.

<query>
${originalQuery}
</query>

<context>
${JSON.stringify(finalDedupedRelevantResults)}
</context>
                    `
                            : `
Generate a very brief summary (5-6 sentences MAX) directly answering the core question implied by the **Original Query**, based on the research findings in the provided \`Context\`.

Instructions:
1.  Extract only the most critical facts/conclusions from the \`Context\` relevant to the **Original Query**.
2.  Combine into a single paragraph (5-6 sentences max).
3.  State findings directly and objectively, focusing on answering the query. No intros or narrative flair.
4.  Cite *every* factual statement inline: \`[Source Title](URL)\`. Use exact titles/URLs from the \`Context\`.

Formatting Instructions:
*   Use Markdown. Use tables if helpful.
*   Use \`$\` for inline math, \`$$\` for block math (not currency).
*   Position \`[Source Title](URL)\` citations accurately.
*   Use descriptive source titles and exact URLs from the \`Context\`.
*   In case of currency, use \`USD\`, \`INR\` or another relevant currency code but not the symbol.
*   Use bullet points if helpful. Avoid headings or any other formatting.


<query>
${originalQuery}
</query>

<context>
${JSON.stringify(finalDedupedRelevantResults)}
</context>

Generate only the concise paragraph answering the query.`,
                });

                dataStream.writeMessageAnnotation({
                    type: 'report',
                    state: 'result',
                });

                finalResponse.consumeStream();
                return finalResponse.mergeIntoDataStream(dataStream);
            },
        });
    } catch (error) {
        console.error(error);
        return new Response((error as Error).message, { status: 500 });
    }
}

function normalizeUrl(url: string): string {
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

function deduplicateSearchResults(searchResults: any): any {
    if (!searchResults || !searchResults.results || !Array.isArray(searchResults.results)) {
        return searchResults;
    }

    const seenUrls = new Set<string>();
    const dedupedResults = { ...searchResults };

    if (dedupedResults.results) {
        dedupedResults.results = dedupedResults.results.filter((result: any) => {
            if (!result || !result.url) return true;

            const url = normalizeUrl(result.url);
            if (seenUrls.has(url)) {
                return false;
            }

            seenUrls.add(url);
            return true;
        });
    }

    if (dedupedResults.images && Array.isArray(dedupedResults.images)) {
        const seenImageUrls = new Set<string>();

        dedupedResults.images = dedupedResults.images.filter((image: any) => {
            if (!image || !image.url) return true;

            const url = normalizeUrl(image.url);
            if (seenImageUrls.has(url)) {
                return false;
            }

            seenImageUrls.add(url);
            return true;
        });
    }

    return dedupedResults;
}

function deduplicateRelevantResults(relevantResults: SearchResult[]): SearchResult[] {
    if (!relevantResults || !Array.isArray(relevantResults)) {
        return relevantResults;
    }

    const seenResultHashes = new Set<string>();
    const dedupedFinalResults: SearchResult[] = [];

    for (const searchResult of relevantResults) {
        if (
            !searchResult.result ||
            !searchResult.result.results ||
            !Array.isArray(searchResult.result.results)
        ) {
            dedupedFinalResults.push(searchResult);
            continue;
        }

        const resultHash = createResultsHash(searchResult.result.results);

        if (!seenResultHashes.has(resultHash)) {
            seenResultHashes.add(resultHash);
            dedupedFinalResults.push(searchResult);
        }
    }

    return dedupedFinalResults;
}
