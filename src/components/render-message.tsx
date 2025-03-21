import { useMemo, memo, useState, useCallback } from 'react';
import { Message, ToolInvocation } from 'ai';
import { UserMessage } from '@/components/chat-message';
import { BotMessage } from '@/components/chat-message';
import { Tool } from '@/components/tool';
import {
    CopyIcon,
    RotateCwIcon,
    CheckIcon,
    GlobeIcon,
    LoaderCircleIcon,
    BinocularsIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'motion/react';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/motion-primitives/accordion';
import { TextLoop } from './motion-primitives/text-loop';

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

    const toolData = useMemo(() => {
        if (message.role !== 'assistant' || !message.parts) {
            return null;
        }

        const toolAnnotations = message.parts.filter((part) => part.type === 'tool-invocation');
        if (toolAnnotations.length === 0) {
            return null;
        }

        return Array.from(
            toolAnnotations.reduce((acc, tool: (typeof toolAnnotations)[0]) => {
                const { toolCallId, state } = tool.toolInvocation;
                if (!acc.has(toolCallId) || state === 'result') {
                    acc.set(toolCallId, tool.toolInvocation);
                }
                return acc;
            }, new Map<string, ToolInvocation>())
        ).map(([_, value]) => value);
    }, [message.role, message.parts]);

    // Group web search tools when there are more than one
    const { webSearchTools, researchPlanTools, otherTools } = useMemo(() => {
        if (!toolData) return { webSearchTools: [], researchPlanTools: [], otherTools: [] };

        const webSearch = toolData.filter((tool) => tool.toolName === 'web_search');
        const researchPlan = toolData.filter((tool) => tool.toolName === 'research_plan_generator');
        const others = toolData.filter(
            (tool) => tool.toolName !== 'web_search' && tool.toolName !== 'research_plan_generator'
        );

        return {
            webSearchTools: webSearch,
            researchPlanTools: researchPlan,
            otherTools: others,
        };
    }, [toolData]);

    // Check if all web search tools have completed loading
    const allWebSearchToolsComplete = useMemo(() => {
        if (webSearchTools.length === 0) return true;
        return webSearchTools.every((tool) => tool.state === 'result');
    }, [webSearchTools]);

    // Count how many web search tools are still loading
    const loadingWebSearchCount = useMemo(() => {
        return webSearchTools.filter((tool) => tool.state !== 'result').length;
    }, [webSearchTools]);

    const sourceCount = useMemo(() => {
        if (webSearchTools.length === 0) return 0;

        return webSearchTools.reduce((total, tool) => {
            if (tool.state !== 'result' || !tool.result || !Array.isArray(tool.result))
                return total;

            return (
                total +
                tool.result.reduce(
                    (subtotal, query: any) => subtotal + (query?.result?.results?.length || 0),
                    0
                )
            );
        }, 0);
    }, [webSearchTools]);

    const searchQueryCount = useMemo(() => {
        if (webSearchTools.length === 0) return 0;

        return webSearchTools.reduce((total, tool) => {
            if (tool.state !== 'result' || !tool.result || !Array.isArray(tool.result))
                return total;
            return total + tool.result.length;
        }, 0);
    }, [webSearchTools]);

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
            {toolData && toolData.length > 0 && (
                <div className="flex flex-col gap-2">
                    {researchPlanTools.map((tool) => (
                        <Tool
                            key={tool.toolCallId}
                            state={tool.state}
                            name={tool.toolName}
                            results={tool.state === 'result' && tool.result}
                        />
                    ))}

                    {webSearchTools.length > 1 ? (
                        <div className="p-4 !w-full bg-neutral-900 rounded-lg font-light text-muted-foreground text-xs">
                            {allWebSearchToolsComplete ? (
                                <Accordion className="w-full !no-underline">
                                    <AccordionItem value="web-searches" className="border-none">
                                        <AccordionTrigger className="p-0 w-full cursor-pointer">
                                            <div className="flex w-full flex-col gap-2">
                                                <div className="flex gap-2 justify-between items-center">
                                                    <div className="flex gap-2 justify-center items-center">
                                                        <BinocularsIcon className="size-3" />
                                                        <span className="font-medium">Sources</span>
                                                    </div>
                                                    <div className="text-xs">
                                                        {sourceCount}{' '}
                                                        {sourceCount === 1 ? 'source' : 'sources'}{' '}
                                                        from {searchQueryCount}{' '}
                                                        {searchQueryCount === 1
                                                            ? 'query'
                                                            : 'queries'}
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="flex w-full flex-col gap-2 pt-4">
                                                <div className="space-y-3 mt-1">
                                                    {webSearchTools.map((tool, index) => (
                                                        <Tool
                                                            key={tool.toolCallId}
                                                            state={tool.state}
                                                            name={tool.toolName}
                                                            results={
                                                                tool.state === 'result' &&
                                                                tool.result
                                                            }
                                                            className={'bg-neutral-950'}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ) : (
                                <div className="flex w-full flex-row justify-between items-center gap-4">
                                    <div className="flex flex-row gap-2 justify-center items-center">
                                        <LoaderCircleIcon className="size-3 animate-spin" />
                                        <div className="font-medium flex items-center gap-1.5">
                                            <TextLoop
                                                interval={3}
                                                className="text-xs font-normal opacity-70"
                                            >
                                                {[
                                                    `Running ${loadingWebSearchCount.toString()} ${loadingWebSearchCount === 1 ? 'search' : 'searches'}...`,
                                                    `Searching the web...`,
                                                    `Gathering sources...`,
                                                ]}
                                            </TextLoop>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        webSearchTools.map((tool) => (
                            <Tool
                                key={tool.toolCallId}
                                state={tool.state}
                                name={tool.toolName}
                                results={tool.state === 'result' && tool.result}
                            />
                        ))
                    )}

                    {otherTools.map((tool) => (
                        <Tool
                            key={tool.toolCallId}
                            state={tool.state}
                            name={tool.toolName}
                            results={tool.state === 'result' && tool.result}
                        />
                    ))}
                </div>
            )}

            <BotMessage message={message.content} />

            {message.role === 'assistant' && message.content && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.1 }}
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
