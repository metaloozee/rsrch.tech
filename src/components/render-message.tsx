import { useMemo, memo } from 'react';
import { Message, ToolInvocation } from 'ai';
import { UserMessage } from '@/components/chat-message';
import { BotMessage } from '@/components/chat-message';
import { Badge } from '@/components/ui/badge';
import { LoaderCircleIcon } from 'lucide-react';

interface RenderMessageProps {
    message: Message;
    messageId: string;
    getIsOpen: (id: string) => boolean;
    onOpenChange: (id: string, open: boolean) => void;
    onQuerySelect: (query: string) => void;
    chatId?: string;
}

const ToolState = memo(({ state, name }: { state: string; name: string }) => {
    if (state === 'call') {
        return (
            <Badge variant={'outline'}>
                <LoaderCircleIcon className="size-3" /> Running {name}
            </Badge>
        );
    }

    return <Badge variant={'outline'}>Done</Badge>;
});

ToolState.displayName = 'ToolState';

export const RenderMessage = memo(function RenderMessage({
    message,
    messageId,
    getIsOpen,
    onOpenChange,
    onQuerySelect,
    chatId,
}: RenderMessageProps) {
    const toolData = useMemo(() => {
        if (message.role !== 'assistant' || !message.parts) {
            return null;
        }

        const toolAnnotations = message.parts.filter((part) => part.type === 'tool-invocation');
        if (toolAnnotations.length === 0) {
            return null;
        }

        return Array.from(
            toolAnnotations.reduce((acc, tool: (typeof toolAnnotations)[0]) => {
                const { toolCallId, state } = tool.toolInvocation;
                if (!acc.has(toolCallId) || state === 'result') {
                    acc.set(toolCallId, tool.toolInvocation);
                }
                return acc;
            }, new Map<string, ToolInvocation>())
        ).map(([_, value]) => value);
    }, [message.role, message.parts]);

    if (message.role === 'user') {
        return <UserMessage message={message.content} />;
    }

    return (
        <>
            {toolData && toolData.length > 0 && (
                <div className="flex flex-row gap-2">
                    {toolData.map((tool) => (
                        <ToolState key={tool.toolCallId} name={tool.toolName} state={tool.state} />
                    ))}
                </div>
            )}
            <BotMessage message={message.content} />
        </>
    );
});

RenderMessage.displayName = 'RenderMessage';
