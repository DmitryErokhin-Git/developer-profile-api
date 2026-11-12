import type { ProfileDocument } from '../../src/data/profile-document.js';

export function profileFixture(): ProfileDocument {
  return {
    name: 'Test Developer',
    description: 'A public developer profile.',
    links: [
      { key: 'github', label: 'GitHub', url: 'https://github.com/example' },
      { key: 'website', label: 'Website', url: 'https://example.com' },
    ],
    skills: [
      { key: 'typescript', name: 'TypeScript' },
      { key: 'postgresql', name: 'PostgreSQL' },
    ],
    experience: [
      {
        key: 'current',
        company: 'Project work',
        position: 'Developer',
        startDate: '2022-09',
        endDate: null,
        achievements: ['Built an API.'],
      },
      {
        key: 'previous',
        company: 'Previous company',
        position: 'Engineer',
        startDate: '2018-07',
        endDate: '2022-12',
        achievements: [],
      },
    ],
    projects: [
      {
        key: 'profile-api',
        name: 'Profile API',
        url: 'https://example.com/profile',
      },
      {
        key: 'previous',
        name: 'Previous project',
        url: 'https://example.com/previous',
      },
    ],
  };
}
