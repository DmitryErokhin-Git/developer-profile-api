import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Sandbox loads the schema and runs the supplied query', async ({
  page,
}) => {
  await page.goto('/graphql');
  const sandbox = page.frameLocator('iframe');
  const run = sandbox.getByRole('button', {
    name: 'DeveloperProfile',
    exact: true,
  });
  await expect(run).toBeEnabled();
  // The schema browser only shows this field after successful introspection.
  await expect(
    sandbox.getByRole('button', {
      name: 'Toggle field to be checked or unchecked profile: Profile',
      exact: true,
    }),
  ).toBeVisible();
  const responsePromise = page.waitForResponse((response) => {
    if (
      response.request().method() !== 'POST' ||
      new URL(response.url()).pathname !== '/graphql'
    )
      return false;
    const body = response.request().postDataJSON() as {
      operationName?: string;
    } | null;
    return body?.operationName === 'DeveloperProfile';
  });
  await run.click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    data?: { profile?: Record<string, unknown> };
    errors?: unknown;
  };
  expect(body.errors).toBeUndefined();
  expect(body.data?.profile?.name).toEqual(expect.any(String));
  for (const field of ['links', 'skills', 'experience', 'projects']) {
    expect(body.data?.profile?.[field]).toEqual(expect.any(Array));
  }
  // Monaco exposes only a visible fragment; the UI download provides the complete response.
  const responseEditor = sandbox
    .getByRole('textbox', {
      name: 'Editor content;Press Alt+F1 for Accessibility Options.',
      exact: true,
    })
    .last();
  await expect(responseEditor).toBeVisible();
  await expect
    .poll(() => responseEditor.inputValue())
    .toContain(JSON.stringify(body.data!.profile!.name));
  const downloadPromise = page.waitForEvent('download');
  await sandbox
    .getByRole('button', { name: 'Download response', exact: true })
    .click();
  const download = await downloadPromise;
  const exported: unknown = JSON.parse(
    await readFile(await download.path(), 'utf8'),
  );
  expect(exported).toEqual(body);
});
