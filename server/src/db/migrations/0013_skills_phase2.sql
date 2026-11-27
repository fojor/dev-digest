CREATE TABLE "run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_version" integer NOT NULL,
	"position" integer NOT NULL,
	"tokens" integer NOT NULL,
	CONSTRAINT "run_skills_run_id_skill_id_pk" PRIMARY KEY("run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_skills_skill_idx" ON "run_skills" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_skill_idx" ON "findings" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_ran_at_idx" ON "agent_runs" USING btree ("agent_id","ran_at");