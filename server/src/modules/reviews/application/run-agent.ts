import type { UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import type { ReviewRunDeps, RunLog } from '../domain/ports.js';
import type { PullRequest, RepoCoordinates, ReviewAgent, ReviewIntent } from '../domain/types.js';
import { REVIEW_STRATEGY } from './constants.js';
import { attributeFindings, renderSkillBlock, taskLine } from './helpers.js';
import { RunCancelledError, type RunOutcome } from './run-types.js';
import { buildCallersDigest, buildRankNote, buildRepoMapDigest } from './run-context.js';
import { buildRunTrace, runCost, traceFromBuffer } from './run-trace.js';

/** The deps a single agent run uses (no git: the diff is loaded once upstream). */
export type AgentRunDeps = Pick<
  ReviewRunDeps,
  'repo' | 'runBus' | 'llmFor' | 'repoIntel' | 'skills' | 'countTokens'
>;

/**
 * Execute a single agent's review against a PR, streaming progress. Persists
 * the outcome (review + findings + agent_runs + trace) or, on failure/cancel,
 * the status + error + log-so-far — then completes the bus and rethrows.
 */
export async function runOneAgent(
  d: AgentRunDeps,
  workspaceId: string,
  pull: PullRequest,
  repo: RepoCoordinates,
  diff: UnifiedDiff,
  agent: ReviewAgent,
  runId: string,
  parentLog: RunLog,
  intent: ReviewIntent | null = null,
): Promise<RunOutcome> {
  const start = Date.now();
  // Per-call usage streamed from the engine. The source of truth on the
  // failure/cancel path, where reviewPullRequest throws without usage.
  const usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 as number | null };
  // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
  // events are already in this run's buffer, so the persisted trace below
  // (built from the buffer) includes them too.
  const runLog = parentLog.forRun(runId, { agent: agent.name });

  runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

  try {
    // Resolve the agent's LLM provider. (llmFor throws if the provider
    // key is missing — caught below and persisted as a failed run.)
    const llm = await runLog.step(
      `Resolving ${agent.provider} provider`,
      () => d.llmFor(agent.provider),
      { kind: 'tool' },
    );

    // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
    // skip all enrichment entirely so its prompt is identical to the
    // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
    // flag, which still gates the facade internally.
    const repoIntelOn = agent.repoIntel !== false;
    if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

    // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
    // returns []; we omit the section and behavior is identical to the
    // pre-T1.3 prompt (acceptance #10).
    const callersDigest = repoIntelOn
      ? await buildCallersDigest(d.repoIntel, pull.repoId, diff, runLog)
      : undefined;

    // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
    // effort: when repo-intel is off / unindexed the facade degrades and the
    // prompt is identical to the pre-T3 shape.
    const repoMap = repoIntelOn ? await buildRepoMapDigest(d.repoIntel, pull.repoId, runLog) : undefined;
    const rankNote = repoIntelOn ? await buildRankNote(d.repoIntel, pull.repoId, diff, runLog) : '';

    const task = taskLine(pull) + rankNote;

    // M2 — the agent's skills (linked + enabled on the link + enabled
    // globally, in link order) become the prompt's "Skills / rules" section.
    // A disabled skill never reaches the prompt or the trace.
    const skills = await d.skills.listEnabledForAgent(agent.id);
    if (skills.length > 0) {
      runLog.info(`Loaded ${skills.length} skill(s): ${skills.map((s) => s.name).join(', ')}`, {
        skills: skills.map((s) => s.name),
      });
    } else {
      runLog.info('No enabled skills for this agent');
    }
    // M2 Phase 2 — record what the prompt contains right away (the run row
    // exists), so failed/cancelled runs count toward pull frequency too.
    const skillBlocks = skills.map(renderSkillBlock);
    const skillTokens = skillBlocks.map((b) => d.countTokens(b));
    await d.repo.recordRunSkills(
      runId,
      skills.map((s, i) => ({ skillId: s.id, skillVersion: s.version, position: i, tokens: skillTokens[i]! })),
    );

    // ---- Engine: assemble → single-pass → grounding -----------------------
    // The pure review pipeline lives in @devdigest/reviewer-core (shared with
    // the CI runner). The service owns only I/O: repo-intel context resolution
    // above, and persistence + observability below.
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      // Per-agent review strategy (configured in the Agent editor); falls back
      // to the studio default. single-pass = whole diff in one call.
      strategy: agent.strategy ?? REVIEW_STRATEGY,
      ...(skills.length > 0 ? { skills: skillBlocks } : {}),
      // T1.3 — pass the callers digest only when we built one. assemblePrompt
      // omits the section when this is empty/undefined.
      ...(callersDigest ? { callers: callersDigest } : {}),
      // T3 — repo skeleton, same omit-when-empty contract.
      ...(repoMap ? { repoMap } : {}),
      // PR author's description/body — untrusted; assemblePrompt wraps +
      // truncates it. Omitted when the PR has no body.
      ...(pull.body ? { prDescription: pull.body } : {}),
      task,
      // Derived PR intent (untrusted; wrapped by the prompt builder). The scope
      // filter only runs when the intent policy enabled it.
      ...(intent
        ? {
            intent: {
              summary: intent.summary,
              inScope: intent.inScope,
              outOfScope: intent.outOfScope,
              confidence: intent.confidence,
              missingContext: intent.missingContext,
              applyScopeFilter: intent.filterEnabled,
            },
          }
        : {}),
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
      onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
      onUsage: (u) => {
        usage.tokensIn += u.tokensIn;
        usage.tokensOut += u.tokensOut;
        usage.costUsd = usage.costUsd == null || u.costUsd == null ? null : usage.costUsd + u.costUsd;
      },
      checkCancelled: () => {
        if (d.runBus.isCancelled(runId)) throw new RunCancelledError();
      },
    });
    const { tokensIn, tokensOut, grounding } = outcome;
    const costUsd = runCost(tokensIn, tokensOut, outcome.costUsd);

    const keptFindings = outcome.review.findings;
    if (intent && outcome.scope.enabled) runLog.info(outcome.scope.summary);

    // ---- Persist review + findings ----------------------------------------
    const review = await d.repo.insertReview({
      workspaceId,
      prId: pull.id,
      agentId: agent.id,
      runId,
      kind: 'review',
      verdict: outcome.review.verdict,
      summary: outcome.review.summary,
      score: outcome.review.score,
      model: agent.model,
    });
    const findingRows = await d.repo.insertFindings(review.id, attributeFindings(keptFindings, skills));
    runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

    // Mark the commit this review ran against so the PR list can tell
    // reviewed / needs-review (head moved) / stale apart.
    await d.repo.markReviewed(pull.id, pull.headSha);

    const durationMs = Date.now() - start;

    // Deterministic blocker count (severity ≥ the agent's gate) — the signal
    // the timeline colors on, NOT the model's self-reported verdict.
    const blockers = countBlockers(keptFindings, agent.ciFailOn);

    // ---- Observability: agent_runs + ONE run_traces document --------------
    await d.repo.completeAgentRun(runId, {
      status: 'done',
      durationMs,
      tokensIn,
      tokensOut,
      costUsd,
      findingsCount: findingRows.length,
      grounding,
      score: outcome.review.score,
      blockers,
      error: null,
    });

    // Tokens the skills add to the prompt (shown in the trace's prompt-assembly
    // section): the sum of the per-skill blocks recorded in run_skills, so it
    // matches the skill editor's counter.
    const trace = buildRunTrace(pull, agent, runId, runLog, outcome, {
      skillsTokens: skillTokens.length > 0 ? skillTokens.reduce((a, b) => a + b, 0) : null,
      durationMs,
      tokensIn,
      tokensOut,
      costUsd,
      findings: findingRows.length,
      grounding,
    });
    runLog.info('Run complete; trace persisted');
    await d.repo.saveRunTrace(runId, trace);
    d.runBus.complete(runId);

    return { review, findings: findingRows, grounding, raw: outcome.review };
  } catch (err) {
    // Failure/cancel: persist status + the error text + the log-so-far so the
    // run (and WHY it failed) is visible on the UI after a reload.
    const cancelled = err instanceof RunCancelledError;
    const status = cancelled ? 'cancelled' : 'failed';
    const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
    runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
    await d.repo
      .completeAgentRun(runId, {
        status,
        durationMs: Date.now() - start,
        // Usage of the LLM calls that completed before the throw.
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsd: runCost(usage.tokensIn, usage.tokensOut, usage.costUsd),
        findingsCount: 0,
        grounding: '0/0 passed',
        error: msg,
      })
      .catch(() => undefined);
    await d.repo
      .saveRunTrace(runId, traceFromBuffer(d.runBus, runId, pull, agent, '0/0 passed', Date.now() - start, usage))
      .catch(() => undefined);
    d.runBus.complete(runId);
    throw err;
  }
}
