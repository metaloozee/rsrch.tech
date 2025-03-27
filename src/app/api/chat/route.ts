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

import { env } from '@/lib/env';
import { mistral } from '@ai-sdk/mistral';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import { ResponseMode } from '@/components/chat-input';

export const maxDuration = 60;

const tvly = tavily({ apiKey: env.TAVILY_API_KEY });

export interface SearchResult {
    query: string;
    result?: any;
    success: boolean;
    error?: any;
}

const smallModel = mistral('mistral-small-latest');
const largeModel = mistral('mistral-large-latest');
const analysisModel = mistral('mistral-small-latest');

export async function POST(req: Request) {
    try {
        const {
            messages,
            id,
            responseMode,
        }: { messages: Message[]; id: string; responseMode: ResponseMode } = await req.json();
        if (!messages || !id || !responseMode) {
            throw new Error('Invalid Body');
        }

        const { object: goals } = await generateObject({
            model: smallModel,
            output: 'object',
            messages: convertToCoreMessages(messages),
            schema: z.object({
                goals: z.array(
                    z.object({
                        goal: z.string(),
                        analysis: z.string(),
                    })
                ),
            }),
            system: `
You are a research goal extractor. Your task is to analyze the conversation history and extract specific research goals that need to be investigated.

When analyzing the conversation:
1. Identify the main question or request from the user and the messages
2. Break down complex queries into distinct research goals
3. Prioritize goals based on importance and logical sequence
4. Format each goal as a clear, searchable objective
5. For each goal, provide a detailed analysis of the research needed to answer the goal

Important: 
- Each goal should be specific enough to guide a web search but broad enough to capture relevant information. 
- Do not make assumptions about facts - stick to extracting research needs from the conversation.
- If the user's query is not clear, abort.
- Generate 1-3 goals depending on the response mode.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}
Response Mode: ${responseMode}

`,
        });

        return createDataStreamResponse({
            async execute(dataStream) {
                const toolResult = await streamText({
                    model: largeModel,
                    providerOptions: {
                        mistral: {
                            parallelToolCalls: true,
                        },
                    },
                    messages: [...convertToCoreMessages(messages)],
                    onError: ({ error }) => {
                        console.error('Error Occurred in Step 2: ', error);
                    },
                    system: `
You are a research assistant tasked with delivering comprehensive, precise, and credible information based on a given research plan.
Your task is to investigate research goals by performing targeted web searches, evaluating the results, and synthesizing coherent answers.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

<research-goals>
${JSON.stringify(goals)}
</research-goals>

Available Tools: 
1. \`web_search\`:
    * Description: Performs a web search and returns relevant results.
    * Required: True
2. \`analyze\`:
    * Description: 
        - Critically evaluates the results from the \`web_search\` tool for accuracy, relevance, and credibility. 
        - Synthesizes the data into coherent answers for the respective research goal, noting any gaps or inconsistencies.
    * Required: True

Workflow: 
* For each goal provided, you must adhere to the following steps iteratively.*
1. Generate up-to 5 effective search queries that will yield relevant, diverse information.
2. Call the \`web_search\` tool.
3. Call the \`analyze\` tool.
4. If the research gaps are too large or if responses stray from the goals, refine the queries and repeat the workflow.

When evaluating sources:
- Prioritize recent, authoritative sources
- Note when information might be outdated or controversial
- Identify consensus views vs. minority perspectives

Critical Instructions:
- You MUST ALWAYS use the \`web_search\` tool to perform web searches.
- You MUST ALWAYS use the \`analyze\` tool to critically evaluate the results from the \`web_search\` tool.
- For EACH research goal, you MUST have relevant information fetched, if not then you can re-run the tools.
- You can make multiple tool calls as needed, but each must be purposeful.
- ALWAYS run and review tool outputs before writing your final synthesis.
- DO NOT describe your PROCESS, PLANNING STEPS, or tool execution NARRATIVES.
                    `,
                    tools: {
                        web_search: tool({
                            parameters: z.object({
                                plan: z.object({
                                    goal: z
                                        .string()
                                        .describe('MUST be extracted from <research-goals>'),
                                    analysis: z
                                        .string()
                                        .describe('MUST be extracted from <research-goals>'),
                                    search_queries: z
                                        .array(z.string())
                                        .max(responseMode === 'concise' ? 2 : 3),
                                }),
                            }),
                            execute: async ({ plan }, { toolCallId }) => {
                                console.log(
                                    `Running Search for the goal '${plan.goal}': `,
                                    plan.search_queries
                                );

                                dataStream.writeMessageAnnotation({
                                    type: 'tool-call',
                                    data: {
                                        toolCallId,
                                        toolName: 'web_search',
                                        state: 'call',
                                        args: JSON.stringify({ plan }),
                                    },
                                });

                                const searchResults: SearchResult[] = [];

                                const searchPromises = plan.search_queries.map(async (query) => {
                                    const res = await tvly.search(query, {
                                        maxResults: 2,
                                        searchDepth:
                                            responseMode === 'concise' ? 'basic' : 'advanced',
                                        includeImages: true,
                                        includeAnswer: true,
                                    });

                                    const dedupedResults = deduplicateSearchResults(res);

                                    searchResults.push({
                                        query,
                                        result: dedupedResults,
                                        success: true,
                                    });

                                    return searchResults;
                                });

                                await Promise.all(searchPromises);

                                dataStream.writeMessageAnnotation({
                                    type: 'tool-call',
                                    data: {
                                        toolCallId,
                                        toolName: 'web_search',
                                        state: 'result',
                                        args: JSON.stringify({ plan }),
                                        result: JSON.stringify({
                                            goal: plan.goal,
                                            analysis: plan.analysis,
                                            search_results: searchResults,
                                        }),
                                    },
                                });

                                return searchResults;
                            },
                        }),
                        analyze: tool({
                            parameters: z.object({
                                searchResults: z
                                    .object({
                                        query: z.string(),
                                        result: z.any().optional(),
                                        success: z.boolean(),
                                        error: z.any().optional(),
                                    })
                                    .array(),
                                goal: z.string(),
                                analysis: z.string(),
                            }),
                            execute: async ({ searchResults, goal, analysis }, { toolCallId }) => {
                                console.log(`Running Analysis for the goal: `, goal);

                                const { text: result } = await generateText({
                                    model: analysisModel,
                                    providerOptions: {
                                        groq: {
                                            reasoningFormat: 'hidden',
                                        },
                                    },
                                    prompt: `
You are a research assistant tasked with delivering comprehensive, precise, and credible analysis on the provided search results for a specific research goal and its analysis.
Your task is to critically evaluate the results from a previous step and synthesize the data into coherent answers for the respective research goal, noting any gaps or inconsistencies.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

Goal: ${goal}
Analysis: ${analysis}

<search-results>
${JSON.stringify(searchResults)}
</search-results>
                                    `,
                                });

                                return result;
                            },
                        }),
                    },
                    experimental_repairToolCall: async ({
                        toolCall,
                        tools,
                        parameterSchema,
                        error,
                    }) => {
                        if (NoSuchToolError.isInstance(error)) {
                            return null;
                        }

                        console.log('Repairing the tool: ', toolCall.toolName);

                        const tool = tools[toolCall.toolName as keyof typeof tools];

                        const repairMessage = `
The model tried to call the tool: ${toolCall.toolName} with the following parameters: ${JSON.stringify(toolCall.args)}.
The tool accepts the following schema: ${JSON.stringify(parameterSchema(toolCall))}.

Your job is to fix the arguments.
Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}`;
                        const { text: repairedText } = await generateText({
                            model: smallModel,
                            messages: [
                                {
                                    role: 'system',
                                    content:
                                        'You are a helpful assistant that generates valid JSON according to a schema.',
                                },
                                { role: 'user', content: repairMessage },
                            ],
                            temperature: 0,
                            maxTokens: 500,
                        });

                        let repairedArgs;
                        try {
                            const jsonMatch =
                                repairedText.match(/```json\n([\s\S]*?)\n```/) ||
                                repairedText.match(/```\n([\s\S]*?)\n```/) ||
                                repairedText.match(/\{[\s\S]*\}/);

                            const jsonString = jsonMatch ? jsonMatch[0] : repairedText;

                            repairedArgs = JSON.parse(
                                jsonString.replace(/```json\n|```\n|```/g, '')
                            );

                            tool.parameters.parse(repairedArgs);

                            console.log('Repaired Arguments: ', repairedArgs);
                        } catch (error) {
                            console.error('Failed to parse or validate repaired arguments:', error);
                            repairedArgs = JSON.parse(toolCall.args);
                        }

                        return { ...toolCall, args: JSON.stringify(repairedArgs) };
                    },
                });

                toolResult.mergeIntoDataStream(dataStream, {
                    experimental_sendFinish: false,
                });

                const responseResult = await streamText({
                    model: smallModel,
                    messages: [
                        ...convertToCoreMessages(messages),
                        ...(await toolResult.response).messages,
                    ],
                    experimental_transform: smoothStream(),
                    onError: ({ error }) => {
                        console.error('Error Occurred in Step 3: ', error);
                    },
                    system:
                        responseMode === 'concise'
                            ? `
You are a high-level research assistant responsible for providing extremely concise, credible and precise information using the context from the previous steps (e.g., research planning, data retrieval).

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

CRITICAL INSTRUCTION - LIMIT YOUR RESPONSE TO 3-4 SENTENCES MAXIMUM

<research-goals>
${JSON.stringify(goals)}
</research-goals>

Primary Goal:
- Provide the shortest possible clear answer to the user's query (3-5 sentences total).
- NEVER use headings, bullet points, or any structured formatting.
- Prioritize brevity over comprehensiveness - include only essential information.
- Use simple language and short sentences.
- When providing factual information, ALWAYS include citations in the format [Source Title](URL).
- DO NOT use "$" sign for currencies, use "USD" instead.

Citation Instructions:
- Format citations as [Source Title](URL) directly after each sentence containing factual information.
- Keep source titles as short as possible.
- Use the exact URL from search results.
- Do not create a separate citation section.

Remember: Your entire response should be extremely brief (3-5 sentences) - this is not optional.
`
                            : `
You are a high-level research assistant responsible for providing comprehensive, credible, and precise information using the context from previous steps (e.g., research planning, data retrieval).

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

<research-goals>
${JSON.stringify(goals)}
</research-goals>

Primary Goals:
- Strictly adhere to guidelines and focus on the user's needs.
- Deliver responses that are accurate, detailed, and structured.
- Avoid fabrications by sticking to provided context and including proper citations.
- Follow all formatting rules without exception.
- When providing factual information, include citations in the format [Source Title](URL).

Response Structure:
1. Start with a clear and direct answer to the question.
2. Follow up with a comprehensive explanation, structured like a technical blog post with appropriate headings.
3. Use markdown formatting (including tables where useful) and clearly demarcate inline math with '$' and block math with '$$' (do not use '$' for USD amounts; use "USD" instead).
4. In subsequent interactions that are not search queries or feedback-related, engage in a natural, conversational tone.

Citation Instructions:
- Position [Source Title](URL) citations directly after each sentence or paragraph containing factual information.
- All objective claims must be supported by citations.
- Use clear, descriptive source titles that indicate the authority or type of source.
- Citations must appear where information is presented, never in a separate section.
- Maintain strict adherence to the [Source Title](URL) format.
- Use the exact URL from search results without modification.
- Citations should be placed immediately after the statement they support, for example: "The Earth revolves around the Sun [Astronomy Today](https://example.com)."

Your responses should be well-organized, technically insightful, and directly address the query.
`,
                });

                responseResult.consumeStream();

                return responseResult.mergeIntoDataStream(dataStream, {
                    experimental_sendStart: false,
                    sendReasoning: false,
                });
            },
        });
    } catch (error) {
        console.error(error);
        return new Response((error as Error).message, { status: 500 });
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
