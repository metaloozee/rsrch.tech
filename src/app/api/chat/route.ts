import {
    convertToCoreMessages,
    createDataStreamResponse,
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

export async function POST(req: Request) {
    try {
        const { messages, id } = await req.json();
        if (!messages || !id) {
            throw new Error('Invalid Body');
        }

        return createDataStreamResponse({
            async execute(dataStream) {
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
Your responses should be thorough, analytical, and presented like a professional technical blog explaining each and every aspect of the topic.

## Core Principles
- **Comprehensiveness**: Provide detailed information covering multiple aspects of the query.
- **Accuracy**: Ensure all information is factual and up-to-date.
- **Attribution**: Properly cite sources for all research-derived content.
- **Organization**: Structure responses with clear sections and logical flow.
- **Continuity**: Conclude responses by asking about clarity, offering further details, suggesting related topics, or encouraging deeper exploration.

## Research Workflow
1. **Analyze Query**: Examine the complete conversation context to understand the user's request and their level of expertise.
2. **Execute Research**: Use the tools below:
- **web_search**
    - Purpose: Retrieve current information from the internet.
    - Structure each search with:
        - **Primary terms**: 2+ core concepts directly related to the query.
        - **Secondary terms**: 3+ related concepts to broaden the search.
        - **Temporal qualifiers**: Include time-specific terms when the query involves time-sensitive information.
3. **Notify User**: Inform the user that research is underway while tools are processing.
4. **Synthesize Information**: Critically evaluate all tool results:
    - Assess relevance to the query.
    - Verify accuracy and credibility of sources.
    - Integrate only the most pertinent information into your response.
    - Provide necessary context or background information to enhance understanding.
5. **Follow-up Research**: If initial results are insufficient, conduct additional targeted searches using refined terms.
6. **Deliver Response**: Create a structured answer that:
    - Integrates all relevant information from tools into a coherent narrative or argument.
    - Uses markdown formatting for readability (e.g., headings, bullet points, numbered lists).
    - Includes proper citations for all research-derived content.
    - Addresses all aspects of the user's query.
    - Provides context or background information when necessary.
    - Avoid any internal texts such as "Alright! I have analyzed the results...", "Here is a detailed explanation...", etc.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}
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

                                // Define interface for search results
                                interface SearchResult {
                                    query: string;
                                    result?: any;
                                    success: boolean;
                                    error?: any;
                                }

                                const searchResults: SearchResult[] = [];

                                // Initialize all query statuses as in_progress
                                search_queries.forEach((query, i) => {
                                    dataStream.writeMessageAnnotation({
                                        type: 'tool-call',
                                        data: {
                                            toolCallId,
                                            toolName: 'web_search',
                                            state: 'streaming',
                                            args: JSON.stringify({
                                                query_index: i,
                                                query: query,
                                                status: 'in_progress',
                                            }),
                                        },
                                    });
                                });

                                // Create an array of promises for concurrent execution
                                const searchPromises = search_queries.map((query, i) => {
                                    return tvly
                                        .search(query, {
                                            maxResults: 1,
                                            searchDepth: 'basic',
                                            includeImages: true,
                                            includeImageDescriptions: true,
                                            includeAnswer: true,
                                            includeRawContent: true,
                                        })
                                        .then((res) => {
                                            const dedupedResults = deduplicateSearchResults(res);

                                            // Add to results array
                                            searchResults.push({
                                                query,
                                                result: dedupedResults,
                                                success: true,
                                            });

                                            // Update status for this query
                                            dataStream.writeMessageAnnotation({
                                                type: 'tool-call',
                                                data: {
                                                    toolCallId,
                                                    toolName: 'web_search',
                                                    state: 'streaming',
                                                    args: JSON.stringify({
                                                        query_index: i,
                                                        query: query,
                                                        status: 'complete',
                                                        result: dedupedResults,
                                                    }),
                                                },
                                            });
                                        })
                                        .catch((error) => {
                                            console.error(`Error searching for "${query}":`, error);

                                            searchResults.push({
                                                query,
                                                error: (error as Error).message || 'Search failed',
                                                success: false,
                                            });

                                            dataStream.writeMessageAnnotation({
                                                type: 'tool-call',
                                                data: {
                                                    toolCallId,
                                                    toolName: 'web_search',
                                                    state: 'streaming',
                                                    args: JSON.stringify({
                                                        query_index: i,
                                                        query: query,
                                                        status: 'error',
                                                        error:
                                                            (error as Error).message ||
                                                            'Search failed',
                                                    }),
                                                },
                                            });
                                        });
                                });

                                // Wait for all promises to complete
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
