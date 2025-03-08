'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Message } from '@ai-sdk/react';
import { useRef, useState } from 'react';
import { CornerDownLeftIcon, StopCircleIcon } from 'lucide-react';

interface InputPanelProps {
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    stop: () => void;
    append: (message: any) => void;
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
}: InputPanelProps) {
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
        <div
            className={cn(
                'mx-auto w-full',
                messages.length > 0
                    ? 'bottom-0 left-0 right-0'
                    : 'flex flex-col items-center justify-center'
            )}
        >
            <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.1 }}
                    className={cn(
                        'relative flex flex-col w-full p-4 gap-2 border border-neutral-900 shadow-lg bg-neutral-900 focus-within:border-accent hover:border-accent transition-all duration-300',
                        messages.length > 0 ? 'mb-4 rounded-xl' : 'rounded-xl'
                    )}
                >
                    <Textarea
                        autoFocus
                        onCompositionStart={handleCompositionStart}
                        onCompositionEnd={handleCompositionEnd}
                        ref={inputRef}
                        name="input"
                        rows={1}
                        tabIndex={0}
                        placeholder="Ask me anything..."
                        spellCheck={false}
                        value={input}
                        className="resize-none w-full bg-transparent ring-0 border-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div></div>
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
                </motion.div>
            </form>
        </div>
    );
}
