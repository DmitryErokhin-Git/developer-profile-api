import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { OWNER_PROFILE_KEY } from './profile.constants.js';

const orderBy = [{ sortOrder: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class ProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findOwner() {
    return this.prismaService.client.profile.findUnique({
      where: { key: OWNER_PROFILE_KEY },
      select: { id: true, name: true, description: true },
    });
  }

  findLinks(profileId: string) {
    return this.prismaService.client.professionalLink.findMany({
      where: { profileId },
      select: { id: true, label: true, url: true },
      orderBy: [...orderBy],
    });
  }

  findSkills(profileId: string) {
    return this.prismaService.client.skill.findMany({
      where: { profileId },
      select: { id: true, name: true },
      orderBy: [...orderBy],
    });
  }

  findExperience(profileId: string) {
    return this.prismaService.client.experience.findMany({
      where: { profileId },
      select: {
        id: true,
        company: true,
        position: true,
        startDate: true,
        endDate: true,
        achievements: true,
      },
      orderBy: [...orderBy],
    });
  }

  findProjects(profileId: string) {
    return this.prismaService.client.project.findMany({
      where: { profileId },
      select: { id: true, name: true, url: true },
      orderBy: [...orderBy],
    });
  }
}
