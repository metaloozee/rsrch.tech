'use client';

import React from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark, oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

import { MemoizedReactMarkdown } from '@/components/markdown';
import Link from 'next/link';

import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BrainIcon, UserCircleIcon } from 'lucide-react';
import { CopyIcon, CheckIcon, CodeIcon } from 'lucide-react';
import { Button } from './ui/button';

const extractDomain = (url: string): string => {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return url;
    }
};

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const [isCopied, setIsCopied] = React.useState(false);

    const handleCopy = () => {
        const code = String(children).replace(/\n$/, '');
        navigator.clipboard.writeText(code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const iconVariants = {
        initial: { opacity: 0, scale: 0.8, rotate: -10 },
        animate: { opacity: 1, scale: 1, rotate: 0 },
        exit: { opacity: 0, scale: 0.8, rotate: 10 },
    };

    const rippleVariants = {
        initial: { scale: 0, opacity: 0.5 },
        animate: { scale: 1.5, opacity: 0 },
    };

    return !inline && match ? (
        <div className="relative w-full max-w-2xl">
            <div className="flex items-center justify-between bg-zinc-900/50 px-4 py-2.5 rounded-t-lg border-x border-t border-border">
                <div className="flex items-center gap-1.5">
                    <CodeIcon className="size-3 text-muted-foreground" />
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        {match[1]}
                    </div>
                </div>
                <div className="relative">
                    <Button
                        variant="ghost"
                        size={'icon'}
                        className="h-6 w-6 bg-background/60 hover:bg-muted border border-border/50 shadow-sm transition-all duration-200 hover:scale-105 relative overflow-hidden"
                        onClick={handleCopy}
                        title={isCopied ? 'Copied!' : 'Copy code'}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            {isCopied && (
                                <motion.span
                                    className="absolute inset-0 bg-foreground/10 rounded-sm"
                                    variants={rippleVariants}
                                    initial="initial"
                                    animate="animate"
                                    transition={{ duration: 0.5 }}
                                />
                            )}
                        </AnimatePresence>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={isCopied ? 'check' : 'copy'}
                                variants={iconVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                            >
                                {isCopied ? (
                                    <CheckIcon className="text-muted-foreground size-2" />
                                ) : (
                                    <CopyIcon className="text-muted-foreground size-2" />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </Button>
                    <AnimatePresence>
                        {isCopied && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.2 }}
                                className="absolute right-0 top-full mt-1 text-xs bg-background/90 border border-border/50 shadow-sm rounded px-2 py-1 pointer-events-none z-20"
                            >
                                Copied!
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            <SyntaxHighlighter
                {...props}
                style={oneDark}
                wrapLongLines
                showLineNumbers
                language={match[1]}
                PreTag="div"
                className="!rounded-t-none !rounded-b-lg !m-0"
                customStyle={{
                    background: 'hsl(var(--background))',
                    padding: '1.25rem 1rem',
                    border: '1px solid hsl(var(--border))',
                    borderTop: 'none',
                }}
            >
                {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
        </div>
    ) : (
        <code
            className={cn('text-sm bg-muted px-1.5 py-0.5 rounded-md font-mono', className)}
            {...props}
        >
            {children}
        </code>
    );
};

const markdownComponents = {
    code: CodeBlock,
    table: ({ children }: any) => <Table className="border my-4">{children}</Table>,
    thead: ({ children }: any) => <TableHeader className="bg-muted/50">{children}</TableHeader>,
    tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
    tr: ({ children }: any) => <TableRow className="hover:bg-muted/30">{children}</TableRow>,
    th: ({ children }: any) => <TableHead className="font-semibold">{children}</TableHead>,
    td: ({ children }: any) => <TableCell>{children}</TableCell>,
    p: ({ children }: any) => <p className="mb-4 leading-7 text-zinc-300">{children}</p>,
    h1: ({ children }: any) => <h1 className="text-3xl font-bold mt-6 mb-4">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-2xl font-semibold mt-5 mb-3">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>,
    ul: ({ children }: any) => (
        <ul className="list-disc marker:text-muted-foreground list-outside pl-6 mb-4">
            {children}
        </ul>
    ),
    ol: ({ children }: any) => <ol className="list-decimal list-outside pl-6 mb-4">{children}</ol>,
    li: ({ children }: any) => <li className="mb-1 text-zinc-300">{children}</li>,
    blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-muted pl-4 italic my-4">{children}</blockquote>
    ),
    a: ({ children, href }: any) => (
        <Link href={href} target="_blank" className="text-xs text-muted-foreground hover:underline">
            {href ? extractDomain(href) : children}
        </Link>
    ),
    strong: ({ children }: any) => <strong className="font-bold text-zinc-100">{children}</strong>,
    inlineMath: ({ value }: { value: string }) => <span className="math math-inline">{value}</span>,
    math: ({ value }: { value: string }) => <div className="math math-display">{value}</div>,
};

interface BotMessageProps {
    message: string;
    className?: string;
}

export function BotMessage({ message, className }: BotMessageProps) {
    // const cleanedMessage = removeContemplateContent(message || '');
    const containsLaTeX = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/.test(message);
    const processedData = preprocessLaTeX(message);

    if (processedData.length <= 1) {
        return null;
    }

    const commonProps = {
        className: cn(
            'prose prose-neutral dark:prose-invert max-w-none',
            'prose-p:leading-7 prose-pre:p-0',
            'prose-headings:font-semibold',
            'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
            'prose-strong:font-semibold prose-strong:text-foreground',
            className
        ),
    };

    if (containsLaTeX) {
        return (
            <MemoizedReactMarkdown
                {...commonProps}
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[
                    [rehypeExternalLinks, { target: '_blank' }],
                    rehypeRaw,
                    rehypeKatex,
                ]}
                components={markdownComponents}
            >
                {processedData}
            </MemoizedReactMarkdown>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            className="w-full flex justify-start items-start"
        >
            <Avatar className="mr-2">
                <AvatarFallback className="bg-neutral-900">
                    <BrainIcon className="size-4 text-neutral-300" />
                </AvatarFallback>
            </Avatar>

            <MemoizedReactMarkdown
                {...commonProps}
                components={markdownComponents}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }], rehypeRaw]}
                remarkPlugins={[remarkGfm]}
            >
                {processedData}
            </MemoizedReactMarkdown>
        </motion.div>
    );
}

const preprocessLaTeX = (content: string) => {
    const blockProcessedContent = content.replace(
        /\\\[([\s\S]*?)\\\]/g,
        (_, equation) => `$$${equation}$$`
    );
    const inlineProcessedContent = blockProcessedContent.replace(
        /\\\(([\s\S]*?)\\\)/g,
        (_, equation) => `$${equation}$`
    );
    return inlineProcessedContent;
};

export const UserMessage: React.FC<{ message: string }> = ({ message }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            className="w-full flex justify-start items-center py-4"
        >
            <Avatar className="mr-2">
                <AvatarFallback className="bg-zinc-900">
                    <UserCircleIcon className="size-4 text-muted-foreground" />
                </AvatarFallback>
            </Avatar>
            <div className="text-muted-foreground">{message}</div>
        </motion.div>
    );
};
