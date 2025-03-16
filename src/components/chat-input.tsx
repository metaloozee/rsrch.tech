'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Message } from '@ai-sdk/react';
import { useRef, useState } from 'react';
import {
    BrainIcon,
    CornerDownLeftIcon,
    GlobeLock,
    ScanSearchIcon,
    StopCircleIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMobileView } from '@/lib/hooks';

interface InputPanelProps {
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    stop: () => void;
    append: (message: any) => void;

    deepResearch: boolean;
    setDeepResearch: (deepResearch: boolean) => void;
}

export default function InputPanel({
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    messages,
    setMessages,
    stop,
    append,

    deepResearch,
    setDeepResearch,
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
                'mx-auto w-full',
                isMobile
                    ? 'bottom-0 left-0 right-0'
                    : messages.length > 0
                      ? 'bottom-0 left-0 right-0'
                      : 'flex flex-col items-center justify-center'
            )}
        >
            {messages.length === 0 &&
                (isMobile ? (
                    <motion.div
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex justify-center items-center h-screen w-full mx-auto"
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
                        onChange={(e) => {
                            handleInputChange(e);
                        }}
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
                            onClick={() => setDeepResearch(!deepResearch)}
                            className="cursor-pointer px-4 py-2 bg-neutral-800 rounded-md flex flex-row gap-2 justify-center items-center *:transition-all *:duration-300"
                        >
                            <BrainIcon
                                className={cn(
                                    'size-4',
                                    deepResearch ? 'text-amber-500' : 'text-neutral-500'
                                )}
                            />
                            <p
                                className={cn(
                                    'text-xs',
                                    deepResearch ? 'text-neutral-300' : 'text-neutral-500'
                                )}
                            >
                                Deep Research
                            </p>
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
                                        size={'sm'}
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
                                            <StopCircleIcon />
                                        </motion.div>
                                    </Button>
                                ) : (
                                    <Button
                                        className="px-4"
                                        size={'sm'}
                                        type="submit"
                                        disabled={!input || isLoading}
                                        variant={input ? 'default' : 'secondary'}
                                    >
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
                                            <CornerDownLeftIcon
                                                className={cn(
                                                    input
                                                        ? 'text-background'
                                                        : 'text-muted-foreground'
                                                )}
                                            />
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
