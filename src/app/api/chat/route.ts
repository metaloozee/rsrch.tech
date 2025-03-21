import {
    convertToCoreMessages,
    createDataStreamResponse,
    generateText,
    NoSuchToolError,
    smoothStream,
    streamText,
    tool,
    Message,
} from 'ai';

import { env } from '@/lib/env';
import { mistral } from '@ai-sdk/mistral';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { ResponseMode } from '@/components/chat-input';

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
        const {
            messages,
            id,
            responseMode,
        }: { messages: Message[]; id: string; responseMode: ResponseMode } = await req.json();
        if (!messages || !id || !responseMode) {
            throw new Error('Invalid Body');
        }

        return createDataStreamResponse({
            async execute(dataStream) {
                const res = await streamText({
                    model: mistral('mistral-small-latest'),
                    messages: convertToCoreMessages(messages),
                    toolChoice: 'required',
                    onError: ({ error }) => {
                        console.error('Error Occurred in Step 1: ', error);
                    },
                    tools: {
                        research_plan_generator: tool({
                            description:
                                'REQUIRED tool that must be called to generate research goals. You MUST wait for the results of this tool before responding.',
                            parameters: z.object({
                                goals: z
                                    .array(
                                        z.object({
                                            goal: z.string(),
                                            analysis: z.string(),
                                        })
                                    )
                                    .max(responseMode === 'concise' ? 1 : 3),
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

                const goalCount = (await res.response).messages
                    .filter((m) => m.role === 'tool')
                    .flatMap((g) => (g.content[0].result as unknown as any).length)
                    .toLocaleString();

                const toolResult = await streamText({
                    model: mistral('mistral-small-latest'),
                    messages: [
                        ...convertToCoreMessages(messages),
                        ...(await res.response).messages,
                    ],
                    onError: ({ error }) => {
                        console.error('Error Occurred in Step 2: ', error);
                    },
                    system: `
You are a research assistant tasked with delivering comprehensive, precise, and credible information based on a given Research Plan.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

CRITICAL INSTRUCTION:
- You MUST use the web_search tool to fetch information relevant to the research goals.
- NEVER respond without calling the web_search tool.
- For EACH research goal, you MUST have relevant information fetched, if not then you can re-run the tools.
- You can make multiple tool calls as needed, but each must be purposeful.
- ALWAYS run and review tool outputs before writing your final synthesis.

Steps:
1. Analyze the attached Research Plan to identify individual research goals.
2. Generate multiple focused search queries for each identified goal.
3. Call the web_search tool to fetch the latest information relevant to each query.
4. Critically evaluate the results for accuracy, relevance, and credibility.
5. Synthesize the data into coherent answers for each research goal, noting any gaps or inconsistencies.
6. If the research gaps are too large or if responses stray from the goals, refine your queries and repeat tool execution.

Available Tools:
1. \`web_search\`
    * Performs a web search to retrieve information from the internet.
    * You MUST call this tool once per research goal.
    * Parameters:
        - \`search_queries\`: Array of search queries

You MUST execute this entire process through proper tool calls. NEVER skip tool execution.
                    `,
                    tools: {
                        web_search: tool({
                            description:
                                'REQUIRED tool that must be called to perform internet searches. You MUST wait for the results of this tool before responding.',
                            parameters: z.object({
                                search_queries: z
                                    .array(z.string())
                                    .max(responseMode === 'concise' ? 2 : 10),
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
                            model: mistral('mistral-small-latest'),
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
                    onError: ({ error }) => {
                        console.error('Error Occurred in Step 3: ', error);
                    },
                    system:
                        responseMode === 'concise'
                            ? `
You are a high-level research assistant responsible for providing extremely concise, credible and precise information using the context from the previous steps (e.g., research planning, data retrieval).

Current Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

CRITICAL INSTRUCTION - LIMIT YOUR RESPONSE TO 3-5 SENTENCES MAXIMUM

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

Current Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

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
