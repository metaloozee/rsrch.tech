'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Message, useChat } from '@ai-sdk/react';
import { cn } from '@/lib/utils';

import { ScrollArea } from '@/components/ui/scroll-area';
import InputPanel, { ResponseMode } from './chat-input';
import { ChatMessages } from '@/components/chat-messages';
import { useMobileView } from '@/lib/hooks';
import { toast } from 'sonner';
import { ScrollToBottomButton } from './scroll-to-bottom';
import * as React from 'react';

export default function Chat({
    id,
    savedMessages = [],
}: {
    id: string;
    savedMessages?: Message[];
}) {
    const messageEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);

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
        if (messages.length > 0 && !showScrollButton) {
            scrollToBottom();
        }
    }, [messages, showScrollButton]);

    useEffect(() => {
        setMessages(savedMessages);
    }, [id]);

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setData(undefined);
        handleSubmit(e);
    };

    const handleRetry = (message: Message) => {
        if (message.role === 'assistant') {
            // Find the user message that preceded this assistant message
            const index = messages.findIndex((m) => m.id === message.id);
            if (index > 0 && messages[index - 1].role === 'user') {
                const userMessage = messages[index - 1];

                // Remove all messages after and including the user message
                const newMessages = messages.slice(0, index - 1);
                setMessages(newMessages);

                // Re-send the user message to get a new response
                append({
                    role: 'user',
                    content: userMessage.content,
                });
            }
        }
    };

    const handleScroll = () => {
        if (!containerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 0;
        console.log('isNearBottom', isNearBottom);
        setShowScrollButton(!isNearBottom);
    };

    const scrollToBottom = () => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div
            className={cn(
                'h-screen flex flex-col w-full stretch col-span-2',
                isMobile
                    ? 'items-end justify-end'
                    : messages.length === 0
                      ? 'justify-center items-center'
                      : 'items-center justify-between'
            )}
        >
            {messages.length > 0 && (
                <ScrollArea
                    onScroll={handleScroll}
                    ref={containerRef}
                    className="w-full flex-grow overflow-y-auto"
                >
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
                    <div ref={messageEndRef} />
                </ScrollArea>
            )}

            {/* <ScrollToBottomButton show={showScrollButton} onClick={scrollToBottom} /> */}

            <InputPanel
                input={input}
                handleInputChange={handleInputChange}
                handleSubmit={onSubmit}
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
