import type { LLMProvider } from '@devdigest/shared';
import { IntentClassification } from '@devdigest/shared';
import { buildIntentMessages } from '@devdigest/reviewer-core';
import type { IntentClassifier } from '../domain/ports.js';
import type { ClassifierInput, ClassifierResult } from '../domain/types.js';
import { IntentClassificationFailed, type ClassificationFailureReason } from '../domain/errors.js';
import { CLASSIFIER_TIMEOUT_MS } from '../domain/policies.js';

type ProviderId = LLMProvider['id'];

export interface IntentClassifierDeps {
  /** The `review_intent` model chosen in Settings (workspace override, else default). */
  resolveModel(workspaceId: string): Promise<{ provider: ProviderId; model: string }>;
  llmFor(provider: ProviderId): Promise<LLMProvider>;
  timeoutMs?: number;
  /** Records a failure nobody awaits (a call that rejects after the timeout already won). */
  logError?(event: string, err: unknown): void;
}

function reasonFor(err: unknown): ClassificationFailureReason {
  if (err instanceof IntentClassificationFailed) return err.reason;
  const e = err as { code?: unknown; name?: unknown; message?: unknown } | null;
  if (e?.code === 'config_error') return 'no_credentials';
  const text = `${String(e?.name ?? '')} ${String(e?.message ?? '')}`;
  if (/zod|schema|parse|json/i.test(text)) return 'unreadable_answer';
  return 'model_unavailable';
}

/** The one structured completion of an intent classification (same shape as the conventions extractor). */
export class LlmIntentClassifier implements IntentClassifier {
  constructor(private readonly deps: IntentClassifierDeps) {}

  async classify(
    workspaceId: string,
    input: ClassifierInput,
    sessionId: string,
  ): Promise<ClassifierResult> {
    const timeoutMs = this.deps.timeoutMs ?? CLASSIFIER_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolved: { provider: ProviderId; model: string } | null = null;
    let timedOut = false;
    try {
      const { provider, model } = await this.deps.resolveModel(workspaceId);
      resolved = { provider, model };
      const llm = await this.deps.llmFor(provider);
      const call = llm.completeStructured({
        model,
        schema: IntentClassification,
        schemaName: 'IntentClassification',
        messages: buildIntentMessages(input),
        temperature: 0,
        maxRetries: 1,
        timeoutMs,
        sessionId,
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new IntentClassificationFailed('timeout'));
        }, timeoutMs);
      });
      // The losing call may reject later: record it instead of leaving an unhandled rejection.
      // A rejection before the timeout is handled by the catch below, so only late ones are logged.
      call.catch((err: unknown) => {
        if (timedOut) this.deps.logError?.('intent.classifier.late_rejection', err);
      });
      const res = await Promise.race([call, timeout]);
      return {
        answer: res.data,
        provider,
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      };
    } catch (err) {
      throw new IntentClassificationFailed(reasonFor(err), resolved);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
