import { useState } from 'react';
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

function RenderMessageComponent({
    message,
    messageId,
    onQuerySelect,
    chatId,
    onRetry,
}: RenderMessageProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (message.content) {
            navigator.clipboard.writeText(message.content);
            setCopied(true);
            toast.success('Message copied to clipboard');
            setTimeout(() => setCopied(false), 1000);
        }
    };

    const variants = {
        iconVariants: {
            initial: { opacity: 0, scale: 0.8, rotate: -10 } as const,
            animate: { opacity: 1, scale: 1, rotate: 0 } as const,
            exit: { opacity: 0, scale: 0.8, rotate: 10 } as const,
        },
        buttonHoverVariants: {
            hover: {
                backgroundColor: 'rgba(255, 255, 255, 0.1)' as const,
                transition: { duration: 0.2 } as const,
            } as const,
        },
        rotateVariants: {
            initial: { rotate: 0 } as const,
            hover: { rotate: 45, transition: { duration: 0.1 } as const } as const,
        },
        scaleVariants: {
            initial: { scale: 1 } as const,
            hover: { scale: 0.9, transition: { duration: 0.1 } as const } as const,
        },
        motionDivProps: {
            initial: { opacity: 0, y: 10 } as const,
            animate: { opacity: 1, y: 0 } as const,
            transition: { duration: 0.1, ease: 'easeOut' } as const,
            className: 'mt-5 space-y-5' as const,
        },
    };

    if (message.role === 'user') {
        return <UserMessage message={message.content} />;
    }

    const copyButton = (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.div whileHover="hover" initial="initial">
                        <motion.button
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent hover:bg-accent hover:text-accent-foreground"
                            onClick={handleCopy}
                            variants={variants.buttonHoverVariants}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={copied ? 'check' : 'copy'}
                                    variants={variants.iconVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ duration: 0.2 }}
                                >
                                    {copied ? (
                                        <CheckIcon className="size-3" />
                                    ) : (
                                        <motion.div variants={variants.scaleVariants}>
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
    );

    const retryButton = !onRetry ? null : (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.div whileHover="hover" initial="initial">
                        <motion.button
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent hover:bg-accent hover:text-accent-foreground"
                            onClick={onRetry}
                            disabled={!onRetry}
                            variants={variants.buttonHoverVariants}
                        >
                            <motion.div variants={variants.rotateVariants}>
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
    );

    return (
        <motion.div {...variants.motionDivProps}>
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
                            {retryButton}
                            {copyButton}
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

export const RenderMessage = RenderMessageComponent;
