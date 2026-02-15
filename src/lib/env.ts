import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        MISTRAL_API_KEY: z.string().min(1),
        TAVILY_API_KEY: z.string().min(1).startsWith('tvly-'),
        GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
        GROQ_API_KEY: z.string().min(1).startsWith('gsk_').optional(),
        OPENROUTER_API_KEY: z.string().min(1).optional(),
        AI_PROVIDER: z.enum(['mistral', 'google']).optional(),
        AI_FALLBACK_PROVIDER: z.enum(['mistral', 'google']).optional(),
        MODEL_PLAN: z.string().min(1).optional(),
        MODEL_PLAN_FALLBACK: z.string().min(1).optional(),
        MODEL_ANALYSIS: z.string().min(1).optional(),
        MODEL_ANALYSIS_FALLBACK: z.string().min(1).optional(),
        MODEL_REPORT: z.string().min(1).optional(),
        MODEL_REPORT_FALLBACK: z.string().min(1).optional(),
    },
    client: {
        // NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
    },

    // For Next.js >= 13.4.4, you only need to destructure client variables:
    experimental__runtimeEnv: {
        // NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
    },
});
