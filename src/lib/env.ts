import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        TAVILY_API_KEY: z.string().min(1).startsWith('tvly-'),
        ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
        MISTRAL_API_KEY: z.string().min(1),
        GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    },
    client: {
        NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).startsWith('phc_'),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
        // NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
    },

    // For Next.js >= 13.4.4, you only need to destructure client variables:
    experimental__runtimeEnv: {
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        // NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
    },
});
