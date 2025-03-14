'use client';

import { useState, useEffect } from 'react';

/**
 * A custom hook that detects if the current view is mobile or not
 * based on the window width.
 *
 * @param breakpoint - The width threshold in pixels that determines if a view is mobile (default: 768px)
 * @returns boolean - True if the current view is mobile, false otherwise
 */
export function useMobileView(breakpoint: number = 768): boolean {
    // Initialize with null to avoid hydration errors
    const [isMobile, setIsMobile] = useState<boolean | null>(null);

    useEffect(() => {
        // Helper function to check if window width is below the breakpoint
        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Check on mount
        checkMobile();

        // Listen for window resize events
        window.addEventListener('resize', checkMobile);

        // Cleanup the event listener on component unmount
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    }, [breakpoint]);

    // During SSR, isMobile will be null. Once the client code runs,
    // it will be updated with the correct value.
    // For SSR, we default to desktop view (false)
    return isMobile ?? false;
}

export default useMobileView;
