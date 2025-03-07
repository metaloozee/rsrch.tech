import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        MISTRAL_API_KEY: z.string().min(1),
        TAVILY_API_KEY: z.string().min(1).startsWith('tvly-'),
    },
    client: {
        // NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
    },

    // For Next.js >= 13.4.4, you only need to destructure client variables:
    experimental__runtimeEnv: {
        // NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
    },
});
