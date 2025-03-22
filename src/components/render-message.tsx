import { useState, useCallback } from 'react';
import { Message } from 'ai';
import { UserMessage } from '@/components/chat-message';
import { BotMessage } from '@/components/chat-message';
import { CopyIcon, RotateCwIcon, CheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { UnifiedToolDisplay } from '@/components/unified-tool-display';

interface RenderMessageProps {
    message: Message;
    messageId: string;
    onQuerySelect: (query: string) => void;
    chatId?: string;
    onRetry?: () => void;
}

export function RenderMessage({
    message,
    messageId,
    onQuerySelect,
    chatId,
    onRetry,
}: RenderMessageProps) {
    console.log('Rendering message:', messageId);
    console.log('Message structure:', JSON.stringify(message, null, 2));
    console.log('Message parts:', message.parts);
    console.log('Message annotations:', (message as any).annotations);

    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        if (message.content) {
            navigator.clipboard.writeText(message.content);
            setCopied(true);
            toast.success('Message copied to clipboard');
            setTimeout(() => setCopied(false), 1000);
        }
    }, [message.content]);

    const iconVariants = {
        initial: { opacity: 0, scale: 0.8, rotate: -10 },
        animate: { opacity: 1, scale: 1, rotate: 0 },
        exit: { opacity: 0, scale: 0.8, rotate: 10 },
    };

    const buttonHoverVariants = {
        hover: {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            transition: { duration: 0.2 },
        },
    };

    const rotateVariants = {
        initial: { rotate: 0 },
        hover: { rotate: 45, transition: { duration: 0.1 } },
    };

    const scaleVariants = {
        initial: { scale: 1 },
        hover: { scale: 0.9, transition: { duration: 0.1 } },
    };

    if (message.role === 'user') {
        return <UserMessage message={message.content} />;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="mt-5 space-y-5"
        >
            <UnifiedToolDisplay message={message} />

            <BotMessage message={message.content} />

            {message.role === 'assistant' && message.content && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.1 }}
                    className="w-full flex justify-end items-center"
                >
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-1 justify-center items-center">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <motion.div whileHover="hover" initial="initial">
                                            <motion.button
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent hover:bg-accent hover:text-accent-foreground"
                                                onClick={onRetry}
                                                disabled={!onRetry}
                                                variants={buttonHoverVariants}
                                            >
                                                <motion.div variants={rotateVariants}>
                                                    <RotateCwIcon className="size-3" />
                                                </motion.div>
                                            </motion.button>
                                        </motion.div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Regenerate response</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <motion.div whileHover="hover" initial="initial">
                                            <motion.button
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent hover:bg-accent hover:text-accent-foreground"
                                                onClick={handleCopy}
                                                variants={buttonHoverVariants}
                                            >
                                                <AnimatePresence mode="wait" initial={false}>
                                                    <motion.div
                                                        key={copied ? 'check' : 'copy'}
                                                        variants={iconVariants}
                                                        initial="initial"
                                                        animate="animate"
                                                        exit="exit"
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        {copied ? (
                                                            <CheckIcon className="size-3" />
                                                        ) : (
                                                            <motion.div variants={scaleVariants}>
                                                                <CopyIcon className="size-3" />
                                                            </motion.div>
                                                        )}
                                                    </motion.div>
                                                </AnimatePresence>
                                            </motion.button>
                                        </motion.div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{copied ? 'Copied!' : 'Copy to clipboard'}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Verify Information. Mistakes are possible.
                        </p>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
