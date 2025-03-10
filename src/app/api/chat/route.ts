import {
    convertToCoreMessages,
    createDataStreamResponse,
    generateId,
    generateObject,
    generateText,
    smoothStream,
    streamText,
    tool,
} from 'ai';

import { env } from '@/lib/env';
import { mistral } from '@ai-sdk/mistral';
import { z } from 'zod';
import { tavily } from '@tavily/core';

export const maxDuration = 30;

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
                dataStream.writeMessageAnnotation({
                    type: 'tool-call',
                    data: {
                        toolCallId: generateId(),
                        toolName: 'query_analysis',
                        state: 'call',
                        // args: JSON.stringify({ }),
                    },
                });

                const { object: plan } = await generateObject({
                    model: mistral('mistral-small-latest'),
                    messages: convertToCoreMessages(messages),
                    schema: z.object({
                        goals: z.array(z.string()).max(10),
                    }),
                    system: `
You are a research assistant designed to analyze the full conversation history and prepare a refined roadmap for the research phase. Your task is to:

1. Analyze the Message History: 
    * Thoroughly review the conversation history to extract key points, objectives, and any implicit or explicit research goals.

2. Articulate and Enhance Goals: 
    * Based on your analysis, formulate a clear and concise list of actionable research goals. Limit the list to no more than 10 goals. Ensure each goal is specific, measurable, and prioritized.

3. Identify Relevant Research Domains:  
    * Determine the research domains that align with the conversation, such as technology, academic literature, market trends, etc. Briefly justify why each domain is included to guide subsequent research phases.

4. Plan Tool Integration:  
    * Acknowledge that you have access to tools like web search. Outline how these tools can be leveraged to acquire additional data, insights, or context relevant to the research goals.

5. Prepare a Structured Roadmap:  
    * Develop a step-by-step plan that transitions from the goal articulation phase to the main research phase. This should include key milestones, potential research questions, and necessary preparatory steps.
                    `,
                });

                console.log('Reseach Plan:', plan);

                dataStream.writeMessageAnnotation({
                    type: 'tool-call',
                    data: {
                        toolCallId: generateId(),
                        toolName: 'query_analysis',
                        state: 'result',
                        args: JSON.stringify({ plan }),
                    },
                });

                const result = await streamText({
                    model: mistral('mistral-large-latest'),
                    messages: convertToCoreMessages(messages),
                    maxSteps: 5,
                    experimental_transform: smoothStream({
                        chunking: 'word',
                        delayInMs: 15,
                    }),
                    system: `
You are an advanced research assistant committed to delivering comprehensive, accurate, and well-sourced information. 
Your responses should be thorough, analytical, and presented like a professional technical blog that explains every aspect of the topic. 
You must strictly adhere to the research plan generated in the previous phase.

## Core Principles
- **Comprehensiveness**: Provide detailed and multi-faceted information covering all relevant aspects.
- **Accuracy**: Ensure all data and information are factually correct and current.
- **Attribution**: Properly cite sources for all research-derived content.
- **Organization**: Structure responses with clear sections, logical flow, and appropriate markdown formatting.
- **Continuity**: End responses by confirming clarity, offering additional details, suggesting related topics, or prompting for further exploration.

## Research Workflow (Follow the Generated Research Plan)
1. **Analyze Query and Context**: Examine the complete conversation history to fully understand the user's request and expertise level.

2. **Execute the Research Plan**:  
   - **Review the Research Plan**: Follow the research plan generated earlier, ensuring every step is addressed.
   - **Use Tools**: Employ the following tools as directed by the research plan:
     - **web_search**  
       - Structure each search with:
         - **Primary Terms**: At least 2 core concepts directly related to the query.
         - **Secondary Terms**: At least 3 related concepts to expand the search.
         - **Temporal Qualifiers**: Include time-specific terms when needed.

3. **Synthesize and Evaluate Information**:  
   - Critically assess all tool results for relevance, accuracy, and credibility.
   - Integrate only the most pertinent information, providing necessary context and background.

4. **Conduct Follow-up Research if Necessary**: Refine and execute additional searches using targeted terms if initial results are insufficient.

5. **Deliver the Final Response**:  
   - Create a well-structured answer that integrates all relevant information into a coherent narrative.
   - Use markdown for readability (headings, bullet points, numbered lists).
   - Include proper citations for all research-derived content.
   - Ensure the response addresses every aspect of the user's query without any extraneous internal commentary.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}

Research Plan:
${plan ?? null}

`,
                    tools: {
                        web_search: tool({
                            description:
                                'Performs a thorough search on the internet for up-to-date information.',
                            parameters: z.object({
                                search_queries: z.array(z.string()).max(3),
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
                                        maxResults: 1,
                                        searchDepth: 'advanced',
                                        includeImages: true,
                                        includeImageDescriptions: true,
                                        includeAnswer: true,
                                        includeRawContent: true,
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
                                        args: JSON.stringify({ search_results: searchResults }),
                                    },
                                });

                                return searchResults;
                            },
                        }),
                    },
                });

                result.consumeStream();

                return result.mergeIntoDataStream(dataStream);
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
