import { mistral } from '@ai-sdk/mistral';
import { google } from '@ai-sdk/google';
import { env } from '@/lib/env';

export type ModelRole = 'plan' | 'analysis' | 'report';

type Provider = 'mistral' | 'google';

const defaultModels: Record<ModelRole, string> = {
    plan: 'mistral-small-latest',
    analysis: 'mistral-small-latest',
    report: 'mistral-large-latest',
};

const modelAliases: Record<ModelRole, string> = {
    plan: env.MODEL_PLAN ?? defaultModels.plan,
    analysis: env.MODEL_ANALYSIS ?? defaultModels.analysis,
    report: env.MODEL_REPORT ?? defaultModels.report,
};

const provider = (env.AI_PROVIDER ?? 'mistral') as Provider;

function getProviderModel(modelId: string) {
    if (provider === 'google') {
        return google(modelId);
    }

    return mistral(modelId);
}

export function getModel(role: ModelRole) {
    return getProviderModel(modelAliases[role]);
}

export function getModelConfig() {
    return {
        provider,
        models: modelAliases,
    };
}
