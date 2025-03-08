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
}

export function ChatMessages({
    messages,
    data,
    onQuerySelect,
    isLoading,
    chatId,
}: ChatMessageProps) {
    const messageEndRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messageEndRef.current?.scrollIntoView({ behavior: 'instant' });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    if (!messages.length) return null;

    const showLoading = isLoading && messages[messages.length - 1].role === 'user';

    return (
        <div className="px-4 w-full mt-10 mx-auto max-w-3xl">
            {messages.map((message) => (
                <RenderMessage
                    key={message.id}
                    message={message}
                    messageId={message.id}
                    getIsOpen={() => true}
                    onOpenChange={() => {}}
                    onQuerySelect={onQuerySelect}
                    chatId={chatId}
                />
            ))}

            {showLoading && (
                <div className="flex justify-center my-4">
                    <div className="flex gap-2 items-center text-xs text-neutral-400">
                        <LoaderCircleIcon className="animate-spin size-3" />
                        <span>Thinking...</span>
                    </div>
                </div>
            )}
            <div ref={messageEndRef} />
        </div>
    );
}
