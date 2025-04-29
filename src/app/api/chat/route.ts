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
import { mistral } from '@ai-sdk/mistral';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { groq } from '@ai-sdk/groq';
import { tavily } from '@tavily/core';
import { google } from '@ai-sdk/google';

export const maxDuration = 60;

const tvly = tavily({ apiKey: env.TAVILY_API_KEY });

const smallModel = mistral('mistral-small-latest');
const largeModel = mistral('mistral-large-latest');

// const smallModel = google('gemini-2.5-flash-preview-04-17');
// const largeModel = google('gemini-2.5-flash-preview-04-17');

export interface SearchResult {
    query: string;
    result?: any;
    success: boolean;
    error?: any;
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

        return createDataStreamResponse({
            async execute(dataStream) {
                // --- Stage 1: Goal Generation ---
                dataStream.writeMessageAnnotation({
                    type: 'plan',
                    state: 'call',
                });

                const { object: goalsData } = await generateObject({
                    model: smallModel,
                    schema: z.object({
                        goals: z
                            .array(
                                z.object({
                                    goal: z.string(),
                                    analysis: z.string(),
                                    search_queries: z
                                        .array(
                                            z.object({
                                                topic: z.enum(['general', 'news', 'finance']),
                                                query: z.string(),
                                            })
                                        )
                                        .min(1),
                                })
                            )
                            .min(1),
                    }),
                    messages: convertToCoreMessages(messages),
                    system: `
You are an elite investigative journalist mapping out your strategy for a new investigation. Your first task is to deeply analyze the conversation history and define clear goals, search strategies, and analysis plans before initiating detailed research.

Analyze the provided conversation history to understand its core components, nuances, and potential angles. Based on this analysis, define a set of specific goals.
For each goal, generate multiple targeted search queries suitable for a search engine, and outline the key information or analysis required to achieve that goal later in the investigation.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

INSTRUCTIONS:
1. Analyze the Topic: 
* Briefly break down the topic into its primary concepts, entities (people, organizations, places, etc.), keywords, and potential sub-topics.
* Identify the implicit questions or areas needing investigation (e.g., What are the causes? What are the effects? Who are the key players? What is the history? What are the future trends? Are there any controversies?).
* Consider the likely scope (timeframe, geography, etc.) suggested by the topic.
* Consider the type of document that is most likely to contain the information you need to achieve the goal.

2. Define Goals:
* Formulate ${responseMode === 'research' ? '3-5' : '1-3'} distinct, actionable research goals that collectively cover the key aspects identified in your analysis. Goals should be specific enough to guide the research (e.g., "Goal: Understand the historical evolution of Topic X," "Goal: Identify the primary economic impacts of Policy Y on Sector Z," "Goal: Analyze expert predictions regarding the future adoption of Technology A," "Goal: Document the main arguments for and against Initiative B").

3. Develop Strategy per Goal: For *each* defined goal:
a. Generate Search Queries: Propose ${responseMode === 'research' ? '3-5' : '1-3'} specific search queries designed to find relevant information for *this goal*. These queries should be suitable for direct use with a search engine. Use varied keywords, synonyms, and consider boolean operators (AND, OR, NOT) or phrase searching ("...") where appropriate.
b. Outline Analysis Plan: Specify *what kind* of information needs to be extracted or *what type of analysis* should be performed on the search results later to satisfy *this goal*.

Respond only with the JSON Object while following the provided format / schema.
                    `,
                });

                const totalSearchQueries = goalsData.goals.reduce(
                    (total, goal) => total + goal.search_queries.length,
                    0
                );

                dataStream.writeMessageAnnotation({
                    type: 'plan',
                    state: 'result',
                    count: goalsData.goals.length,
                    data: goalsData.goals,
                    total_search_queries: totalSearchQueries,
                });

                // --- Stage 2 & 3: Parallel Search and Analysis per Goal ---
                const allAnalysisResults = await Promise.all(
                    goalsData.goals.map(async (goalItem, goalIndex) => {
                        const goalId = `goal_${goalIndex + 1}`;

                        dataStream.writeMessageAnnotation({
                            type: 'goal',
                            goal_id: goalId,
                            state: 'start',
                            goal: goalItem.goal,
                            analysis_plan: goalItem.analysis,
                            queries: goalItem.search_queries,
                        });

                        // --- Stage 2: Parallel Search within the Goal ---
                        const searchResults: SearchResult[] = [];
                        const searchPromises = goalItem.search_queries.map(
                            async (queryItem, queryIndex) => {
                                const queryId = `${goalId}_query_${queryIndex + 1}`;
                                dataStream.writeMessageAnnotation({
                                    type: 'search',
                                    goal_id: goalId,
                                    query_id: queryId,
                                    state: 'call',
                                    topic: queryItem.topic,
                                    query: queryItem.query,
                                });

                                try {
                                    const res = await tvly.search(queryItem.query, {
                                        topic: queryItem.topic,
                                        maxResults: 2,
                                        searchDepth:
                                            responseMode === 'concise' ? 'basic' : 'advanced',
                                    });

                                    const dedupedResults = deduplicateSearchResults(res);
                                    const resultData = {
                                        query: queryItem.query,
                                        result: dedupedResults,
                                        success: true,
                                    };
                                    searchResults.push(resultData);

                                    dataStream.writeMessageAnnotation({
                                        type: 'search',
                                        goal_id: goalId,
                                        query_id: queryId,
                                        state: 'result',
                                        data: resultData,
                                    });
                                    return resultData;
                                } catch (error: any) {
                                    console.error(
                                        `Search failed for query '${queryItem.query}':`,
                                        error
                                    );
                                    const errorData = {
                                        query: queryItem.query,
                                        success: false,
                                        error: error.message || 'Unknown search error',
                                    };
                                    searchResults.push(errorData);
                                    dataStream.writeMessageAnnotation({
                                        type: 'search',
                                        goal_id: goalId,
                                        query_id: queryId,
                                        state: 'error',
                                        data: errorData,
                                    });
                                    return errorData; // Return error data to maintain array structure
                                }
                            }
                        );

                        // Wait for all searches for the current goal to complete
                        const goalSearchResults = await Promise.all(searchPromises);

                        dataStream.writeMessageAnnotation({
                            type: 'goal',
                            goal_id: goalId,
                            state: 'search_complete',
                            search_results_count: goalSearchResults.length,
                        });

                        // --- Stage 3: Analysis for the Goal ---
                        dataStream.writeMessageAnnotation({
                            type: 'analysis',
                            goal_id: goalId,
                            state: 'call',
                        });

                        const { text: searchAnalysis } = await generateText({
                            model: smallModel,
                            prompt: `
You are a diligent Research Assistant specializing in information triage. Your task is to quickly evaluate a list of search engine results, determining which ones are most likely to contain relevant and authoritative information for the specific goal.

A tool was just executed to retrieve up-to-date information related to a specific goal. You must now analyze the returned list of results (URLs, titles, content) and recommend which ones seem most promising.

You must also provide a short summary of the search results and the most promising results.

Goal: ${goalItem.goal}
Analysis to Perform: ${goalItem.analysis}
Search Results: ${JSON.stringify(goalSearchResults)}
                            `,
                        });

                        dataStream.writeMessageAnnotation({
                            type: 'analysis',
                            goal_id: goalId,
                            state: 'result',
                            data: searchAnalysis,
                        });

                        dataStream.writeMessageAnnotation({
                            type: 'goal',
                            goal_id: goalId,
                            state: 'complete',
                        });

                        // Return analysis and original goal/search info for final report context
                        return {
                            goal: goalItem.goal,
                            analysis_plan: goalItem.analysis,
                            search_results: goalSearchResults,
                            analysis_summary: searchAnalysis,
                        };
                    })
                );

                // --- Stage 4: Final Report Generation ---
                dataStream.writeMessageAnnotation({
                    type: 'report',
                    state: 'call',
                });

                const finalResponse = await streamText({
                    model: largeModel,
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
You are an elite investigative journalist transitioning from analysis to writing. Your task is to craft a compelling, well-structured narrative based on your synthesized findings, adhering to the style and standards of The New York Times.

Your goal is to write a full investigative report based on the research topic, using the provided context. Critically, you must first **determine the most logical and informative structure** for this *specific* report based on the nature of the findings, then write the report following that structure. Do **not** use a generic, predefined template if the context suggests a different organization would be clearer or more impactful.

Instructions:

1.  Analyze Context & Determine Structure:
    *   Carefully review the research topic and the findings presented in the \`Context\`.
    *   Based on this analysis, decide on the most effective structure for the report. Consider organizational patterns like:
        *   Thematic: Grouping findings by key themes or arguments.
        *   Chronological: Presenting events or developments over time.
        *   Stakeholder-Based: Analyzing impacts or perspectives for different groups.
        *   Problem/Solution: Outlining a challenge and exploring potential answers.
        *   Geographical: Focusing on different locations or regions.
        *   Key Questions: Structuring the report around answering central research questions.
    *   The structure should facilitate a clear, logical narrative flow appropriate for the specific subject matter.

2.  Craft Headline & Overview:
    *   Create an attention-grabbing yet informative headline reflecting the core subject.
    *   Write a concise opening paragraph (lede) summarizing the report's most crucial findings and their significance. This should immediately tell the reader what the story is about and why it matters.

3.  Develop the Report Body:
    *   Organize the main content according to the structure you determined in Step 1.
    *   Use clear and descriptive Markdown headings (\`## Section Title\`) for each major section. These headings should reflect the specific content of the section, not generic placeholders unless truly appropriate.
    *   Weave the key findings, facts, statistics, expert quotes, and conflicting viewpoints from the \`Context\` seamlessly into the narrative within the relevant sections. Ensure smooth transitions between points and sections.

4.  Maintain Journalistic Style and Tone:
    *   Write in a clear, objective, and engaging style, mirroring The New York Times.
    *   Explain complex concepts simply without sacrificing accuracy.
    *   Maintain objectivity. Present balanced perspectives where conflicting viewpoints exist, attributing claims appropriately. Use neutral language.

5.  Integrate Evidence & Citations:
    *   Ensure *all* objective claims, facts, statistics, and direct quotes are supported by inline citations immediately following the sentence or paragraph they support.
    *   Format citations as: \`[Source Title](URL)\`. Use clear, descriptive source titles and the exact URL provided in the \`Context\`.

6.  Craft a Concluding Section:
    *   Conclude the report with a dedicated \`## Conclusion\` section.
    *   This section should synthesize the main points and key takeaways from the report.
    *   Briefly reiterate the significance of the findings.
    *   Offer a final perspective on the broader implications, potential future developments, or remaining unanswered questions related to the topic, based *only* on the information presented in the report and the provided \`Context\`. Avoid introducing new information not covered earlier.

Formatting Instructions:

1.  Use Markdown formatting throughout. Use tables where appropriate for presenting data clearly.
2.  Clearly demarcate inline math with \`$\` and block math with \`$$\`. Do not use \`$\` for currency; use standard currency codes (e.g., USD, EUR).
3.  Position \`[Source Title](URL)\` citations *directly after* the sentence or paragraph containing the factual information they support. Every factual claim needs a citation.
4.  Use clear, descriptive source titles that indicate the authority or type of source (e.g., "Official Census Report", "Interview with Dr. Jane Smith", "Peer-Reviewed Study in Nature").
5.  Use the exact URL provided in the \`Context\` without modification.

Context (Contains results for each research goal):

${JSON.stringify(allAnalysisResults)}
                    `
                            : `
Your task is to generate a very brief summary, **no more than 5-6 sentences**, directly answering the core question implied by the research findings in the provided context.

Instructions:
1.  Identify the Absolute Core Answer: Extract only the most critical facts or conclusions from the \`Context\` that directly address the central theme or question.
2.  Synthesize into a Single Paragraph: Combine these key points into a single, short paragraph of 5-6 sentences maximum.
3.  Be Direct and Factual: State the findings clearly and objectively. Avoid introductory phrases, narrative flair, or section breaks.
4.  Cite Sources Inline: Immediately follow each factual statement with its citation in the format \`[Source Title](URL)\`. Ensure all objective claims are cited using the exact URLs provided.
5.  Formatting: Use simple markdown. Use '$' for inline math and '$$' for block math where necessary (avoid for currency, use "USD"). **Do not use headings, bullet points, or any other structuring elements.**

Context (Contains results for each research goal):

${JSON.stringify(allAnalysisResults)}

Generate only the concise paragraph based on these instructions.`,
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
