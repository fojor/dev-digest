import type { UnifiedDiff } from '@devdigest/shared';
import type { Logger, ReviewRunDeps, ReviewsRepository, RunLog } from '../domain/ports.js';
import type { PullRequest, RepoCoordinates, ReviewAgent, ReviewIntent } from '../domain/types.js';
import { REVIEW_INTENT_WAIT_MS } from './constants.js';
import { loadDiff } from './diff-loader.js';
import { RunCancelledError } from './run-types.js';
import { runOneAgent } from './run-agent.js';
import { traceFromBuffer } from './run-trace.js';

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 *
 * Collaborators: run-agent.ts (one agent's run + persistence), run-context.ts
 * (repo-intel prompt context), run-trace.ts (RunTrace building + runCost).
 */
export class ReviewRunExecutor {
  private readonly repo: ReviewsRepository;

  constructor(private readonly d: ReviewRunDeps) {
    this.repo = d.repo;
  }

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRequest,
    repo: RepoCoordinates,
    jobs: { agent: ReviewAgent; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = this.d.openRunLog(
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null, // pre-work failed before any LLM call
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, traceFromBuffer(this.d.runBus, runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.d.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.d.git, this.repo, this.d.parseDiff, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    const intent = await this.resolveIntent(workspaceId, pull, runLog, logger);

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await runOneAgent(this.d, workspaceId, pull, repo, diff, agent, runId, runLog, intent);
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /**
   * Shared pre-work: the PR intent, resolved once for every queued run. Fail-open:
   * an error or a timeout (REVIEW_INTENT_WAIT_MS) means "no intent, no scope filter".
   */
  private async resolveIntent(
    workspaceId: string,
    pull: PullRequest,
    runLog: RunLog,
    logger?: Logger,
  ): Promise<ReviewIntent | null> {
    const provider = this.d.intent;
    if (!provider) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const call = provider.forReview(workspaceId, pull.id);
      // The losing call may reject after the timeout wins: record it instead of leaving it unhandled.
      // A rejection before the timeout reaches the catch below, so only late ones are logged here.
      call.catch((err: unknown) => {
        if (timedOut) {
          logger?.warn(
            { prId: pull.id, err: (err as Error)?.message ?? String(err) },
            'review: intent resolution failed after the wait timed out',
          );
        }
      });
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve('timeout');
        }, REVIEW_INTENT_WAIT_MS);
      });
      const intent = await runLog.step('Resolving PR intent', () => Promise.race([call, timeout]), {
        kind: 'tool',
      });
      if (intent === 'timeout') {
        runLog.info('Intent unavailable (timeout) — reviewing without scope filter');
        return null;
      }
      if (!intent) {
        runLog.info('Intent unavailable (classification failed) — reviewing without scope filter');
        return null;
      }
      runLog.info(
        `Intent: ${intent.outcome} (confidence ${intent.confidence}; sources ${intent.sourcesSummary}; ` +
          `scope filter ${intent.filterEnabled ? 'on' : 'off'})`,
      );
      return intent;
    } catch (err) {
      runLog.info(`Intent unavailable (${(err as Error).message}) — reviewing without scope filter`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
