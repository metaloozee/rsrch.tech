'use client';

import { FormEvent, useEffect } from 'react';
import { Message, useChat } from '@ai-sdk/react';
import { cn } from '@/lib/utils';

import { ScrollArea } from '@/components/ui/scroll-area';
import InputPanel from './chat-input';
import { ChatMessages } from './chat-messages';
import { useMobileView } from '@/lib/hooks';

export default function Chat({
    id,
    savedMessages = [],
}: {
    id: string;
    savedMessages?: Message[];
}) {
    const isMobile = useMobileView();

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
        },
        onError: (error) => {
            console.error(error);
        },
        sendExtraMessageFields: true,
    });

    useEffect(() => {
        setMessages(savedMessages);
    }, [id]);

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setData(undefined);
        handleSubmit(e);
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
                <ScrollArea className="w-full flex-grow">
                    <ChatMessages
                        messages={messages}
                        isLoading={isLoading}
                        data={data}
                        onQuerySelect={(query) => {
                            setInput(query);
                        }}
                        chatId={id}
                    />
                </ScrollArea>
            )}

            <InputPanel
                input={input}
                handleInputChange={handleInputChange}
                handleSubmit={onSubmit}
                isLoading={isLoading}
                messages={messages}
                setMessages={setMessages}
                stop={stop}
                append={append}
            />
        </div>
    );
}
