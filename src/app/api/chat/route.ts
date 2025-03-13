import {
    convertToCoreMessages,
    createDataStreamResponse,
    generateId,
    generateObject,
    generateText,
    NoSuchToolError,
    smoothStream,
    streamObject,
    streamText,
    tool,
} from 'ai';

import { env } from '@/lib/env';
import { mistral } from '@ai-sdk/mistral';
import { z } from 'zod';
import { tavily } from '@tavily/core';

export const maxDuration = 60;

const tvly = tavily({ apiKey: env.TAVILY_API_KEY });

export interface SearchResult {
    query: string;
    result?: any;
    success: boolean;
    error?: any;
}

export async function POST(req: Request) {
    try {
        const { messages, id } = await req.json();
        if (!messages || !id) {
            throw new Error('Invalid Body');
        }

        return createDataStreamResponse({
            async execute(dataStream) {
                const res = await streamText({
                    model: mistral('mistral-large-latest'),
                    messages: convertToCoreMessages(messages),
                    toolChoice: 'required',
                    tools: {
                        research_plan_generator: tool({
                            parameters: z.object({
                                goals: z
                                    .array(
                                        z.object({
                                            goal: z.string(),
                                            analysis: z.string(),
                                        })
                                    )
                                    .max(3),
                            }),
                            execute: async ({ goals }, { toolCallId }) => {
                                dataStream.writeMessageAnnotation({
                                    type: 'tool-call',
                                    data: {
                                        toolCallId,
                                        toolName: 'research_plan_generator',
                                        state: 'result',
                                        args: JSON.stringify({ goals }),
                                        result: JSON.stringify({ goals }),
                                    },
                                });

                                console.log('Goals: ', goals);

                                return goals;
                            },
                        }),
                    },
                    system: `
You are a language model designed to assist a research assistant application that has access to the internet. 
Your primary function is to analyze the complete chat history along with the most recent query to extract the main goals that the user intends to achieve. 

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

Follow these steps carefully:
1. Context Analysis
    - Review the full chat history and the latest query.
    - Identify recurring themes, requests, and explicit instructions.
    - Determine the primary objectives that the user is aiming for, ensuring no important details are overlooked.

2. Goal Extraction
    - Extract and list each main goal mentioned or implied in the conversation.
    - For each goal, ensure that you capture the essence of the objective succinctly and clearly.
    - If any goal appears to have multiple facets, split it into individual actionable components.

3. Research Analysis Generation
    - For every extracted goal, generate a corresponding research analysis plan to be performed after the goal's completion.
    - The research analysis should include:
        - Key Questions: What specific questions should be answered to confirm the goal has been met effectively?
        - Data Sources: Identify the types of online sources or databases that might be relevant.
        - Methodology: Outline a step-by-step plan for conducting the analysis (e.g., literature reviews, data scraping, statistical methods, comparative analysis, etc.).
        - Verification Steps: Include methods to validate the accuracy and relevance of the research findings.
        - Next Steps: Suggest subsequent actions or follow-up research that could further enhance understanding or application of the goal's outcomes.

4. Additional Considerations
    - Maintain a balance between brevity and comprehensiveness, so that the research analysis plan is detailed yet succinct enough to be actionable.
    - Prioritize clarity and directness so that subsequent automated modules or human users can follow your output without ambiguity.
    - You are allowed to generate up to 3 goals.
`,
                });

                res.mergeIntoDataStream(dataStream, {
                    experimental_sendFinish: false,
                });

                const toolResult = await streamText({
                    model: mistral('mistral-large-latest'),
                    messages: [
                        ...convertToCoreMessages(messages),
                        ...(await res.response).messages,
                    ],
                    maxSteps: 5,
                    system: `
You are a research assistant tasked with delivering comprehensive, precise, and credible information based on a given Research Plan.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

Steps:
1. Analyze the attached Research Plan to identify individual research goals.
2. Generate multiple focused search queries for each identified goal.
3. Call the designated tools (e.g., web_search) to fetch the latest information relevant to each query.
4. Critically evaluate the results for accuracy, relevance, and credibility.
5. Synthesize the data into coherent answers for each research goal, noting any gaps or inconsistencies.
6. If the research gaps are too large or if responses stray from the goals, refine your queries and repeat tool execution.

Tool Call Guidelines:
- Use each tool once per cycle.
- You may perform multiple calls with different parameters when needed.
- Always run and review tool outputs before writing your final synthesis.

                    `,
                    tools: {
                        web_search: tool({
                            description:
                                'Performs a thorough search on the internet for up-to-date information.',
                            parameters: z.object({
                                search_queries: z.array(z.string()).max(5),
                            }),
                            execute: async ({ search_queries }, { toolCallId }) => {
                                dataStream.writeMessageAnnotation({
                                    type: 'tool-call',
                                    data: {
                                        toolCallId,
                                        toolName: 'web_search',
                                        state: 'call',
                                        args: JSON.stringify({ search_queries }),
                                    },
                                });

                                console.log('Search Queries: ', search_queries);

                                const searchResults: SearchResult[] = [];

                                const searchPromises = search_queries.map(async (query, i) => {
                                    const res = await tvly.search(query, {
                                        maxResults: 2,
                                        searchDepth: 'basic',
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
                                        args: JSON.stringify({ search_queries }),
                                        result: JSON.stringify({ search_results: searchResults }),
                                    },
                                });

                                return searchResults;
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
                            model: mistral('mistral-large-latest'),
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
                    onError(event) {
                        console.error(event.error);
                    },
                });

                toolResult.mergeIntoDataStream(dataStream, {
                    experimental_sendFinish: false,
                });

                const responseResult = await streamText({
                    model: mistral('mistral-large-latest'),
                    messages: [
                        ...convertToCoreMessages(messages),
                        ...(await res.response).messages,
                        ...(await toolResult.response).messages,
                    ],
                    experimental_transform: smoothStream({
                        chunking: 'word',
                        delayInMs: 30,
                    }),
                    system: `
You are a high-level research assistant responsible for providing comprehensive, credible, and precise information using the context from previous steps (e.g., research planning, data retrieval).

Current Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

Primary Goals:
- Strictly adhere to guidelines and focus on the user's needs.
- Deliver responses that are accurate, detailed, and structured.
- Avoid fabrications by sticking to provided context and including proper citations.
- Follow all formatting rules without exception.

Response Structure:
1. Start with a clear and direct answer to the question.
2. Follow up with a comprehensive explanation, structured like a technical blog post with appropriate headings.
3. Use markdown formatting (including tables where useful) and clearly demarcate inline math with '$' and block math with '$$' (do not use '$' for USD amounts; use "USD" instead).
4. In subsequent interactions that are not search queries or feedback-related, engage in a natural, conversational tone.

Your responses should be well-organized, technically insightful, and directly address the query.
                    `,
                });

                responseResult.consumeStream();

                return responseResult.mergeIntoDataStream(dataStream, {
                    experimental_sendStart: false,
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
