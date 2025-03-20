'use client';

import React, { useRef } from 'react';
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
import { ArrowUpRightIcon, SparklesIcon } from 'lucide-react';
import { CopyIcon, CheckIcon, CodeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

const extractDomain = (url: string): string => {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return url;
    }
};

const formatCitationUrl = (url: string): string => {
    try {
        if (url.match(/^https?:\/\//i)) {
            return url;
        }

        return `https://${url.replace(/^\/\//, '')}`;
    } catch (error) {
        console.error('Error formatting citation URL:', error);
        return url;
    }
};

const getFaviconUrl = (domain: string): string => {
    // Using Google's favicon service
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
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
        <div className="relative w-full my-4">
            <div className="flex items-center justify-between bg-neutral-900 px-4 py-1 rounded-t-lg border-x border-t border-border">
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
                        className="transition-all duration-200"
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
                                    <CheckIcon className="text-muted-foreground size-3" />
                                ) : (
                                    <CopyIcon className="text-muted-foreground size-3" />
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
                wrapLine
                showLineNumbers
                language={match[1]}
                PreTag="div"
                className="!rounded-t-none !rounded-b-lg !m-0 !bg-neutral-900 border !text-sm overflow-scroll"
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
    table: ({ children }: any) => <Table className="border my-4 w-full">{children}</Table>,
    thead: ({ children }: any) => <TableHeader className="bg-muted/50">{children}</TableHeader>,
    tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
    tr: ({ children }: any) => <TableRow className="hover:bg-muted/30">{children}</TableRow>,
    th: ({ children }: any) => <TableHead className="font-semibold p-3">{children}</TableHead>,
    td: ({ children }: any) => <TableCell className="p-3">{children}</TableCell>,
    p: ({ children }: any) => <p className="leading-7 mb-4 text-neutral-200">{children}</p>,
    h1: ({ children }: any) => (
        <h1 className="text-3xl font-bold mt-8 mb-4 text-white">{children}</h1>
    ),
    h2: ({ children }: any) => (
        <h2 className="text-2xl font-semibold mt-6 mb-3 text-white">{children}</h2>
    ),
    h3: ({ children }: any) => (
        <h3 className="text-xl font-semibold mt-5 mb-3 text-white">{children}</h3>
    ),
    h4: ({ children }: any) => (
        <h4 className="text-lg font-semibold mt-4 mb-2 text-white">{children}</h4>
    ),
    ul: ({ children }: any) => (
        <ul className="list-disc marker:text-muted-foreground list-outside pl-6 mb-4 space-y-1">
            {children}
        </ul>
    ),
    ol: ({ children }: any) => (
        <ol className="list-decimal list-outside pl-6 mb-4 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => <li className="mb-1.5 text-neutral-200">{children}</li>,
    blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-primary/70 pl-4 py-1 my-4 bg-muted/20 rounded-r">
            {children}
        </blockquote>
    ),
    strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-neutral-100">{children}</em>,
    hr: () => <Separator className="my-6" />,
    inlineMath: ({ value }: { value: string }) => (
        <span
            suppressHydrationWarning
            className="math math-inline"
            dangerouslySetInnerHTML={{ __html: value }}
        />
    ),
    math: ({ value }: { value: string }) => (
        <span
            suppressHydrationWarning
            className="math math-display block my-4"
            dangerouslySetInnerHTML={{ __html: value }}
        />
    ),
};

// Function to track citation numbers within a message
const useCitationCounter = () => {
    const citationMap = useRef(new Map<string, number>());
    const nextCitationNumber = useRef(1);

    const getCitationNumber = (href: string) => {
        const normalizedUrl = normalizeUrl(href);
        if (!citationMap.current.has(normalizedUrl)) {
            citationMap.current.set(normalizedUrl, nextCitationNumber.current++);
        }
        return citationMap.current.get(normalizedUrl) || 0;
    };

    return { getCitationNumber };
};

// Function to normalize URLs for deduplication
function normalizeUrl(url: string): string {
    try {
        return url
            .trim()
            .toLowerCase()
            .replace(/\/$/, '')
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '');
    } catch {
        return url;
    }
}

interface BotMessageProps {
    message: string;
    className?: string;
}

export function BotMessage({ message, className }: BotMessageProps) {
    const processedData = preprocessLaTeX(message);
    const { getCitationNumber } = useCitationCounter();

    if (processedData.length <= 1) {
        return null;
    }

    const commonProps = {
        className: cn(
            'prose prose-neutral dark:prose-invert max-w-none',
            'prose-p:leading-7 prose-p:mb-4',
            'prose-pre:p-0 prose-pre:my-4',
            'prose-headings:font-semibold prose-headings:text-white',
            'prose-a:text-primary prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-primary/80',
            'prose-strong:font-semibold prose-strong:text-white',
            'prose-ul:mb-4 prose-ol:mb-4 prose-li:mb-1.5 prose-li:text-neutral-200',
            'prose-blockquote:border-l-4 prose-blockquote:border-primary/70 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:bg-muted/20 prose-blockquote:rounded-r',
            className
        ),
    };

    const customMarkdownComponents = {
        ...markdownComponents,
        a: ({ children, href }: any) => {
            if (!href) return <span>{children}</span>;

            const isCitation =
                typeof children === 'string' &&
                children.trim() !== '' &&
                !href?.startsWith('#') &&
                !href?.startsWith('mailto:') &&
                !(children === href || extractDomain(href) === children);

            if (isCitation) {
                const citationNumber = getCitationNumber(href);

                return (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <sup>
                                    <Badge
                                        asChild
                                        variant={'secondary'}
                                        className="text-xs font-semibold cursor-pointer ml-0.5 hover:underline transition-colors"
                                        aria-label={`Citation ${citationNumber}: ${children}`}
                                    >
                                        <Link
                                            href={formatCitationUrl(href)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {citationNumber}
                                        </Link>
                                    </Badge>
                                </sup>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] p-3">
                                <div className="flex flex-col gap-2">
                                    <p className="font-medium text-sm">{children || 'Source'}</p>
                                    <div className="flex items-center">
                                        <img
                                            src={getFaviconUrl(
                                                extractDomain(formatCitationUrl(href))
                                            )}
                                            alt="Site icon"
                                            width={16}
                                            height={16}
                                            className="mr-2 min-w-[16px]"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                        <p className="text-xs truncate">
                                            {extractDomain(formatCitationUrl(href))}
                                        </p>
                                    </div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                );
            }

            return (
                <Link
                    href={href}
                    target="_blank"
                    className="underline underline-offset-2 transition-colors"
                >
                    {children || (href ? extractDomain(href) : '')}
                </Link>
            );
        },
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            className="w-full flex flex-col justify-start items-start"
            suppressHydrationWarning
        >
            <div className="my-2 flex flex-row justify-start items-center gap-2">
                <SparklesIcon className="size-4" />
                <p className="text-sm">Answer</p>
            </div>

            <MemoizedReactMarkdown
                {...commonProps}
                components={customMarkdownComponents}
                rehypePlugins={[
                    [rehypeExternalLinks, { target: '_blank' }],
                    rehypeRaw,
                    rehypeKatex,
                ]}
                remarkPlugins={[remarkGfm, remarkMath]}
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

    const processedParagraphs = inlineProcessedContent.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
        return `\n\n${match}\n\n`;
    });

    return processedParagraphs;
};

export const UserMessage: React.FC<{ message: string }> = ({ message }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            className="w-full flex justify-start items-center py-4"
        >
            <div className="text-muted-foreground text-xl">{message}</div>
        </motion.div>
    );
};
