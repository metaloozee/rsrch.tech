'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Message } from '@ai-sdk/react';
import { useRef, useState } from 'react';
import {
    BrainIcon,
    ScanSearchIcon,
    StopCircleIcon,
    FileText,
    ZapIcon,
    ArrowUpIcon,
} from 'lucide-react';
import { useMobileView } from '@/lib/hooks';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { TextMorph } from '@/components/ui/text-morph';

interface InputPanelProps {
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    stop: () => void;
    append: (message: any) => void;

    responseMode: ResponseMode;
    setResponseMode: (responseMode: ResponseMode) => void;
}

export type ResponseMode = 'concise' | 'research';

const responseModes = [
    {
        value: 'concise',
        label: 'Concise',
        description: 'Brief, direct responses',
        icon: ZapIcon,
        color: 'text-blue-500',
        isDisabled: false,
    },
    {
        value: 'research',
        label: 'Detailed',
        description: 'In-depth reports',
        icon: FileText,
        color: 'text-green-500',
        isDisabled: false,
    },
];

export default function InputPanel({
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    messages,
    setMessages,
    stop,
    append,

    responseMode,
    setResponseMode,
}: InputPanelProps) {
    const isMobile = useMobileView();

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isFirstMessage = useRef(true);

    const [isComposing, setIsComposing] = useState(false);
    const [enterDisabled, setEnterDisabled] = useState(false);

    const handleCompositionStart = () => setIsComposing(true);
    const handleCompositionEnd = () => {
        setIsComposing(false);
        setEnterDisabled(true);

        setTimeout(() => {
            setEnterDisabled(false);
        }, 300);
    };

    return (
        <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={cn(
                'w-full',
                isMobile
                    ? 'fixed bottom-0'
                    : messages.length > 0
                      ? 'fixed bottom-0'
                      : 'h-screen flex-1 flex flex-col justify-center items-center'
            )}
        >
            {messages.length === 0 &&
                (isMobile ? (
                    <motion.div
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex mb-80 justify-center items-end h-full w-full mx-auto"
                    >
                        <div className="flex gap-5 flex-col justify-center items-center">
                            <ScanSearchIcon className="size-10 text-neutral-700" />
                            <h1 className="font-mono text-2xl text-neutral-700 text-center max-w-[50vw]">
                                what would you like to know?
                            </h1>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="mb-5 flex flex-col gap-2 justify-center items-center"
                    >
                        <ScanSearchIcon className=" text-neutral-500" />
                        <h1 className="font-mono text-3xl text-neutral-500">
                            what would you like to know?
                        </h1>
                    </motion.div>
                ))}

            <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto">
                <div
                    className={cn(
                        'relative flex flex-col w-full p-4 gap-2 border border-neutral-700/50 shadow-lg bg-neutral-900 focus-within:border-accent hover:border-accent transition-all duration-300',
                        isMobile
                            ? 'rounded-t-xl'
                            : messages.length > 0
                              ? 'mb-4 rounded-xl'
                              : 'rounded-xl'
                    )}
                >
                    <Textarea
                        autoFocus
                        onCompositionStart={handleCompositionStart}
                        onCompositionEnd={handleCompositionEnd}
                        ref={inputRef}
                        name="input"
                        placeholder={
                            messages.length > 0 ? 'Ask follow-up...' : 'Ask me anything...'
                        }
                        spellCheck={true}
                        value={input}
                        className="resize-none placeholder:text-neutral-500 w-full bg-transparent ring-0 border-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={handleInputChange}
                        onKeyDown={(e) => {
                            if (
                                e.key === 'Enter' &&
                                !e.shiftKey &&
                                !isComposing &&
                                !enterDisabled
                            ) {
                                if (input.trim().length === 0) {
                                    e.preventDefault();
                                    return;
                                }

                                e.preventDefault();
                                const textarea = e.target as HTMLTextAreaElement;
                                textarea.form?.requestSubmit();
                            }
                        }}
                    />
                    <div className="w-full flex justify-between items-center">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.2 }}
                            className="cursor-pointer"
                        >
                            <Select
                                value={responseMode}
                                onValueChange={(value: ResponseMode) => {
                                    setResponseMode(value);
                                }}
                            >
                                <SelectTrigger className="cursor-pointer w-auto min-w-[120px] !bg-neutral-800/70 border-0 hover:!bg-neutral-800 hover:text-neutral-200 px-4 py-2 focus:ring-0 focus-visible:ring-0 rounded-md transition-all duration-300">
                                    <div className="flex items-center gap-2 transition-colors">
                                        {(() => {
                                            const mode = responseModes.find(
                                                (m) => m.value === responseMode
                                            );
                                            const Icon = mode?.icon as React.ElementType;
                                            return <Icon className={cn('size-4', mode?.color)} />;
                                        })()}
                                        <TextMorph className="text-xs font-medium">
                                            {responseModes.find((m) => m.value === responseMode)
                                                ?.label || 'Concise'}
                                        </TextMorph>
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-accent text-neutral-100">
                                    {responseModes.map((mode) => {
                                        const Icon = mode.icon;
                                        return (
                                            <SelectItem
                                                key={mode.value}
                                                value={mode.value}
                                                disabled={mode.isDisabled}
                                                className="py-2 px-4 w-[15rem] data-[highlighted]:bg-neutral-800 data-[highlighted]:text-neutral-200 cursor-pointer focus:outline-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <Icon
                                                        className={cn(
                                                            'h-4 w-4 flex-shrink-0',
                                                            mode.color
                                                        )}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">
                                                            {mode.label}
                                                        </span>
                                                        <span className="text-xs text-neutral-400">
                                                            {mode.description}
                                                        </span>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <AnimatePresence>
                                {isLoading ? (
                                    <Button
                                        size={'icon'}
                                        variant={'destructive'}
                                        onClick={stop}
                                        disabled={!isLoading}
                                    >
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 20 }}
                                            transition={{
                                                delay: 0.2,
                                                type: 'spring',
                                                stiffness: 400,
                                                damping: 10,
                                            }}
                                        >
                                            <StopCircleIcon className="animate-pulse" />
                                        </motion.div>
                                    </Button>
                                ) : (
                                    <Button size={'icon'} type="submit" disabled={isLoading}>
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{
                                                x: 20,
                                            }}
                                            transition={{
                                                delay: 0.2,
                                                type: 'spring',
                                                stiffness: 400,
                                                damping: 10,
                                            }}
                                        >
                                            <ArrowUpIcon />
                                        </motion.div>
                                    </Button>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>
                </div>
            </form>
        </motion.div>
    );
}
