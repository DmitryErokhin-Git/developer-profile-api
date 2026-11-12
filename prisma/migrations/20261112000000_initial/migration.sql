-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalLink" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ProfessionalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "position" VARCHAR(200) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "achievements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BootstrapState" (
    "key" VARCHAR(64) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_key_key" ON "Profile"("key");

-- CreateIndex
CREATE INDEX "ProfessionalLink_profileId_sortOrder_id_idx" ON "ProfessionalLink"("profileId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalLink_profileId_key_key" ON "ProfessionalLink"("profileId", "key");

-- CreateIndex
CREATE INDEX "Skill_profileId_sortOrder_id_idx" ON "Skill"("profileId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_profileId_key_key" ON "Skill"("profileId", "key");

-- CreateIndex
CREATE INDEX "Experience_profileId_sortOrder_id_idx" ON "Experience"("profileId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_profileId_key_key" ON "Experience"("profileId", "key");

-- CreateIndex
CREATE INDEX "Project_profileId_sortOrder_id_idx" ON "Project"("profileId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_profileId_key_key" ON "Project"("profileId", "key");

-- AddForeignKey
ALTER TABLE "ProfessionalLink" ADD CONSTRAINT "ProfessionalLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the domain invariants even for writes outside the importer.
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_dates_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_month_precision_check"
  CHECK (EXTRACT(DAY FROM "startDate") = 1 AND ("endDate" IS NULL OR EXTRACT(DAY FROM "endDate") = 1));
ALTER TABLE "ProfessionalLink" ADD CONSTRAINT "ProfessionalLink_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "Project_sortOrder_check" CHECK ("sortOrder" >= 0);
