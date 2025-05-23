import * as React from 'react';
import { JSONValue, Message } from 'ai';
import { LoaderCircleIcon } from 'lucide-react';
import { RenderMessage } from '@/components/render-message';

interface ChatMessageProps {
    messages: Array<Message>;
    data: Array<JSONValue> | undefined;
    onQuerySelect: (query: string) => void;
    isLoading: boolean;
    chatId?: string;
    onRetry?: (message: Message) => void;
}

export function ChatMessages({
    messages,
    data,
    onQuerySelect,
    isLoading,
    chatId,
    onRetry,
}: ChatMessageProps) {
    if (!messages.length) return null;

    const showLoading = isLoading && messages[messages.length - 1].role === 'user';

    // Create direct callbacks instead of memoized ones
    const retryCallbacks: Record<string, () => void> = {};

    if (onRetry) {
        messages.forEach((message) => {
            retryCallbacks[message.id] = () => onRetry(message);
        });
    }

    return (
        <div className="px-6 w-full mt-10 mx-auto max-w-3xl">
            {messages.map((message) => (
                <RenderMessage
                    key={message.id}
                    message={message}
                    messageId={message.id}
                    onQuerySelect={onQuerySelect}
                    chatId={chatId}
                    onRetry={onRetry ? retryCallbacks[message.id] : undefined}
                />
            ))}

            {showLoading && (
                <div className="flex justify-center items-center my-6">
                    <div className="flex gap-2 items-center text-xs text-neutral-400">
                        <LoaderCircleIcon className="animate-spin size-3" />
                        <span>Thinking...</span>
                    </div>
                </div>
            )}

            <div className="mt-40 shrink-0 min-w-[24px] min-h-[24px]" />
        </div>
    );
}
