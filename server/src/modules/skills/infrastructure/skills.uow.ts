import type { Db } from '../../../db/client.js';
import type { SkillsRepository, SkillsUnitOfWork } from '../domain/ports.js';
import { DrizzleSkillsRepository } from './skills.repository.js';

/** Runs a skills use case's writes in one Postgres transaction. */
export class DrizzleSkillsUnitOfWork implements SkillsUnitOfWork {
  constructor(private readonly db: Db) {}

  run<T>(work: (repos: { skills: SkillsRepository }) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work({ skills: new DrizzleSkillsRepository(tx) }));
  }
}
