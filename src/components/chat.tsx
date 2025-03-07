"use client"

import { FormEvent, useEffect } from "react"
import { Message, useChat } from "@ai-sdk/react"
import { cn } from "@/lib/utils"

import { ScrollArea } from "@/components/ui/scroll-area"
import InputPanel from "./chat-input"

export default function Chat({
    id,
    savedMessages = [],
}: {
    id: string,
    savedMessages?: Message[]
}) {
    const {
        messages, input, handleInputChange, handleSubmit, isLoading, setMessages, stop, append, data, setData
    } = useChat({
        initialMessages: savedMessages,
        body: {
            id
        },
        onFinish: () => {
            if (messages.length === 0) {
                window.history.pushState({}, '', `/${id}`)
            }
        },
        onError: (error) => {
            console.error(error)
        },
        sendExtraMessageFields: true
    })

    useEffect(() => {
        setMessages(savedMessages)
    }, [id])

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setData(undefined)
        handleSubmit(e)
    }

    return (
        <div className="h-screen flex flex-col w-full stretch">
            { messages.length > 0 && (
                <ScrollArea className="w-full flex-grow">

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
    )
}