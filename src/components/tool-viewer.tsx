'use client';

import { useMemo } from 'react';
import { Message } from 'ai';
import { ToolAccordion, ToolData } from './tool-accordion';
import { cn } from '@/lib/utils';

interface ToolViewerProps {
    message: Message;
    className?: string;
}

export function ToolViewer({ message, className }: ToolViewerProps) {
    const formattedToolData: ToolData[] = useMemo(() => {
        if (message.role !== 'assistant' || !message.parts) {
            return [];
        }

        const toolAnnotations = message.parts.filter((part) => part.type === 'tool-invocation');
        if (toolAnnotations.length === 0) {
            return [];
        }

        console.log('Found tool annotations:', toolAnnotations);

        const toolsMap = new Map<string, any>();

        toolAnnotations.forEach((tool) => {
            if (!tool.toolInvocation) {
                console.warn('Tool annotation missing toolInvocation property:', tool);
                return;
            }

            const { toolCallId, state, toolName } = tool.toolInvocation;

            if (!toolsMap.has(toolCallId) || state === 'result') {
                toolsMap.set(toolCallId, tool.toolInvocation);
            }
        });

        console.log('Processed tools map:', Array.from(toolsMap.values()));

        return Array.from(toolsMap.values()).map((tool) => {
            let parsedResult = tool.result;
            if (typeof tool.result === 'string') {
                try {
                    parsedResult = JSON.parse(tool.result);
                } catch (e) {
                    console.error(`Failed to parse tool result for ${tool.toolName}:`, e);
                    parsedResult = tool.result;
                }
            }

            let parsedArgs = tool.args;
            if (typeof tool.args === 'string') {
                try {
                    parsedArgs = JSON.parse(tool.args);
                } catch (e) {
                    console.error(`Failed to parse tool args for ${tool.toolName}:`, e);
                    parsedArgs = tool.args;
                }
            }

            return {
                toolCallId: tool.toolCallId,
                toolName: tool.toolName,
                state: tool.state === 'result' ? 'result' : 'call',
                args: parsedArgs,
                result: parsedResult,
            };
        });
    }, [message]);

    if (formattedToolData.length === 0) {
        return null;
    }

    console.log('Rendering tool data:', formattedToolData);
    return <ToolAccordion tools={formattedToolData} className={cn('mb-5', className)} />;
}
