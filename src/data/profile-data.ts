import { toDatabaseDate } from '../common/year-month.js';
import type { DatabaseClient } from '../database/create-prisma-client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OWNER_PROFILE_KEY } from '../profile/profile.constants.js';
import {
  profileDocumentSchema,
  type ProfileDocument,
} from './profile-document.js';

const BOOTSTRAP_KEY = 'owner-profile';

async function synchronize(
  transaction: Prisma.TransactionClient,
  data: ProfileDocument,
) {
  const profile = await transaction.profile.upsert({
    where: { key: OWNER_PROFILE_KEY },
    create: {
      key: OWNER_PROFILE_KEY,
      name: data.name,
      description: data.description,
    },
    update: { name: data.name, description: data.description },
  });
  const profileId = profile.id;

  await transaction.professionalLink.deleteMany({
    where: { profileId, key: { notIn: data.links.map((item) => item.key) } },
  });
  for (const [sortOrder, item] of data.links.entries()) {
    await transaction.professionalLink.upsert({
      where: { profileId_key: { profileId, key: item.key } },
      create: { ...item, profileId, sortOrder },
      update: { label: item.label, url: item.url, sortOrder },
    });
  }

  await transaction.skill.deleteMany({
    where: { profileId, key: { notIn: data.skills.map((item) => item.key) } },
  });
  for (const [sortOrder, item] of data.skills.entries()) {
    await transaction.skill.upsert({
      where: { profileId_key: { profileId, key: item.key } },
      create: { ...item, profileId, sortOrder },
      update: { name: item.name, sortOrder },
    });
  }

  await transaction.experience.deleteMany({
    where: {
      profileId,
      key: { notIn: data.experience.map((item) => item.key) },
    },
  });
  for (const [sortOrder, item] of data.experience.entries()) {
    const values = {
      company: item.company,
      position: item.position,
      startDate: toDatabaseDate(item.startDate),
      endDate: item.endDate === null ? null : toDatabaseDate(item.endDate),
      achievements: item.achievements,
      sortOrder,
    };
    await transaction.experience.upsert({
      where: { profileId_key: { profileId, key: item.key } },
      create: { key: item.key, profileId, ...values },
      update: values,
    });
  }

  await transaction.project.deleteMany({
    where: { profileId, key: { notIn: data.projects.map((item) => item.key) } },
  });
  for (const [sortOrder, item] of data.projects.entries()) {
    await transaction.project.upsert({
      where: { profileId_key: { profileId, key: item.key } },
      create: { ...item, profileId, sortOrder },
      update: { name: item.name, url: item.url, sortOrder },
    });
  }

  return profile;
}

export async function bootstrapProfile(
  prismaClient: DatabaseClient,
  loadData: () => unknown,
) {
  return prismaClient.$transaction(async (transaction) => {
    if (
      await transaction.bootstrapState.findUnique({
        where: { key: BOOTSTRAP_KEY },
      })
    ) {
      return 'skipped' as const;
    }
    const existing = await transaction.profile.findUnique({
      where: { key: OWNER_PROFILE_KEY },
    });
    if (!existing) {
      const data = profileDocumentSchema.parse(await loadData());
      await synchronize(transaction, data);
    }
    await transaction.bootstrapState.create({ data: { key: BOOTSTRAP_KEY } });
    return existing ? ('preserved' as const) : ('created' as const);
  });
}

export async function importProfile(
  prismaClient: DatabaseClient,
  input: unknown,
) {
  const data = profileDocumentSchema.parse(input);
  return prismaClient.$transaction(async (transaction) => {
    const profile = await synchronize(transaction, data);
    await transaction.bootstrapState.upsert({
      where: { key: BOOTSTRAP_KEY },
      create: { key: BOOTSTRAP_KEY },
      update: {},
    });
    return profile;
  });
}
