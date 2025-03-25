'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Message, useChat } from '@ai-sdk/react';
import { cn } from '@/lib/utils';

import { ScrollArea } from '@/components/ui/scroll-area';
import InputPanel, { ResponseMode } from './chat-input';
import { ChatMessages } from '@/components/chat-messages';
import { useMobileView } from '@/lib/hooks';
import { toast } from 'sonner';
import * as React from 'react';

export default function Chat({
    id,
    savedMessages = [],
}: {
    id: string;
    savedMessages?: Message[];
}) {
    const isMobile = useMobileView();
    const [responseMode, setResponseMode] = useState<ResponseMode>('concise');

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        setMessages,
        stop,
        append,
        data,
        setData,
        setInput,
    } = useChat({
        initialMessages: savedMessages,
        body: {
            id,
            responseMode,
        },
        onError: (error) => {
            toast.error('Something Went Wrong', {
                description:
                    'An unexpected issue occurred. Please try again shortly or contact support if the problem persists.',
            });
            console.error(error);
        },
        sendExtraMessageFields: true,
    });

    useEffect(() => {
        setMessages(savedMessages);
    }, [id]);

    const handleRetry = (message: Message) => {
        if (message.role === 'assistant') {
            const index = messages.findIndex((m) => m.id === message.id);
            if (index > 0 && messages[index - 1].role === 'user') {
                const userMessage = messages[index - 1];

                const newMessages = messages.slice(0, index - 1);
                setMessages(newMessages);

                append({
                    role: 'user',
                    content: userMessage.content,
                });
            }
        }
    };

    return (
        <div className={cn('h-full w-full')}>
            {messages.length > 0 && (
                <ScrollArea className="w-full flex-grow h-screen">
                    <ChatMessages
                        messages={messages}
                        isLoading={isLoading}
                        data={data}
                        onQuerySelect={(query) => {
                            setInput(query);
                        }}
                        chatId={id}
                        onRetry={handleRetry}
                    />
                </ScrollArea>
            )}

            <InputPanel
                input={input}
                handleInputChange={handleInputChange}
                handleSubmit={handleSubmit}
                isLoading={isLoading}
                messages={messages}
                setMessages={setMessages}
                stop={stop}
                append={append}
                responseMode={responseMode}
                setResponseMode={setResponseMode}
            />
        </div>
    );
}
