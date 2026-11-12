import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { profileDocumentSchema } from '../../src/data/profile-document.js';
import { profileFixture } from '../fixtures/profile.js';

describe('profile document validation', () => {
  it('accepts the public seed file', async () => {
    const data: unknown = JSON.parse(
      await readFile(
        new URL('../../data/profile.json', import.meta.url),
        'utf8',
      ),
    );
    expect(profileDocumentSchema.safeParse(data).success).toBe(true);
  });

  it('accepts empty lists and trims display text', () => {
    const input = {
      ...profileFixture(),
      name: '  Developer  ',
      links: [],
      skills: [],
      experience: [],
      projects: [],
    };
    expect(profileDocumentSchema.parse(input).name).toBe('Developer');
  });

  it.each(['links', 'skills', 'experience', 'projects'] as const)(
    'rejects duplicate keys in %s',
    (field) => {
      const input = profileFixture();
      const first = input[field][0]!;
      expect(
        profileDocumentSchema.safeParse({ ...input, [field]: [first, first] })
          .success,
      ).toBe(false);
    },
  );

  it.each(['javascript:alert(1)', 'file:///tmp/private', 'not-a-url'])(
    'rejects an unsafe or invalid URL: %s',
    (url) => {
      const input = profileFixture();
      input.links[0]!.url = url;
      expect(profileDocumentSchema.safeParse(input).success).toBe(false);
    },
  );

  it('rejects an end date before the start and accepts equal months', () => {
    const input = profileFixture();
    input.experience[0]!.endDate = '2022-08';
    expect(profileDocumentSchema.safeParse(input).success).toBe(false);
    input.experience[0]!.endDate = '2022-09';
    expect(profileDocumentSchema.safeParse(input).success).toBe(true);
  });

  it('rejects blank names, unstable keys and unexpected properties', () => {
    expect(
      profileDocumentSchema.safeParse({ ...profileFixture(), name: '  ' })
        .success,
    ).toBe(false);
    expect(
      profileDocumentSchema.safeParse({ ...profileFixture(), phone: 'private' })
        .success,
    ).toBe(false);
    const input = profileFixture();
    input.skills[0]!.key = 'Type Script';
    expect(profileDocumentSchema.safeParse(input).success).toBe(false);
  });
});
