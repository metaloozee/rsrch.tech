'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from 'lucide-react';

interface ScrollToBottomButtonProps {
    onClick: () => void;
    show: boolean;
}

export const ScrollToBottomButton = ({ onClick, show }: ScrollToBottomButtonProps) => {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.3 } }}
                    className="absolute z-10 bottom-10 right-0 left-0 flex justify-center items-center overflow-hidden"
                >
                    <Button
                        size={'sm'}
                        variant={'secondary'}
                        className="text-xs font-light rounded-full flex justify-center items-center gap-1 !px-4"
                        onClick={onClick}
                    >
                        Scroll to bottom
                        <ChevronDownIcon className="size-3" />
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
