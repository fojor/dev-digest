import { DomainError } from '../../_shared/domain/errors.js';

export class SkillNotFound extends DomainError {
  readonly code = 'skill_not_found';
  constructor() {
    super('Skill not found');
  }
}

/** The uploaded file can't be turned into a skill (wrong type, no SKILL.md, too big…). */
export class InvalidSkillImport extends DomainError {
  readonly code = 'invalid_skill_import';
  constructor(message: string) {
    super(message);
  }
}

export class SkillVersionNotFound extends DomainError {
  readonly code = 'skill_version_not_found';
  constructor() {
    super('Skill version not found');
  }
}
