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

const fallbackModelAliases: Partial<Record<ModelRole, string>> = {
    plan: env.MODEL_PLAN_FALLBACK,
    analysis: env.MODEL_ANALYSIS_FALLBACK,
    report: env.MODEL_REPORT_FALLBACK,
};

const provider = (env.AI_PROVIDER ?? 'mistral') as Provider;
const fallbackProvider = env.AI_FALLBACK_PROVIDER as Provider | undefined;

function getProviderModel(modelId: string) {
    if (provider === 'google') {
        return google(modelId);
    }

    return mistral(modelId);
}

export function getModel(role: ModelRole) {
    return getProviderModel(modelAliases[role]);
}

export function getModelCandidates(role: ModelRole) {
    const candidates = [getProviderModel(modelAliases[role])];

    if (fallbackModelAliases[role]) {
        candidates.push(getProviderModel(fallbackModelAliases[role]!));
    }

    if (fallbackProvider && fallbackProvider !== provider) {
        const modelId = fallbackModelAliases[role] ?? modelAliases[role];

        candidates.push(
            fallbackProvider === 'google' ? google(modelId) : mistral(modelId)
        );
    }

    return candidates;
}

export function getModelConfig() {
    return {
        provider,
        fallbackProvider,
        models: modelAliases,
        fallbackModels: fallbackModelAliases,
    };
}
