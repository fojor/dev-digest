import type {
  ClassifierInput,
  ClassifierResult,
  IntentEntity,
  PrFileInfo,
  PullInfo,
  ReadResult,
} from './types.js';

export interface IntentRepository {
  /** The PR when it belongs to the workspace, else undefined. */
  findPull(workspaceId: string, prId: string): Promise<PullInfo | undefined>;
  find(workspaceId: string, prId: string): Promise<IntentEntity | undefined>;
  /** Insert or replace the single intent row of the PR. */
  upsert(entity: IntentEntity): Promise<void>;
  prFiles(prId: string): Promise<PrFileInfo[]>;
}

export interface SourceReader {
  issue(repo: { owner: string; name: string }, number: number): Promise<ReadResult>;
  /** Issues GitHub itself links as closed by the PR. Never throws (empty on failure). */
  closingIssues(
    repo: { owner: string; name: string },
    prNumber: number,
  ): Promise<{ owner: string; name: string; number: number }[]>;
  repoDoc(
    repo: { owner: string; name: string },
    headSha: string,
    path: string,
    prNumber: number,
    prFiles: PrFileInfo[],
  ): Promise<ReadResult>;
  external(url: string): Promise<ReadResult>;
}

export interface IntentClassifier {
  classify(
    workspaceId: string,
    input: ClassifierInput,
    sessionId: string,
  ): Promise<ClassifierResult>;
}
