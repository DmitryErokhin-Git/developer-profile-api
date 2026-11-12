import { Injectable } from '@nestjs/common';
import { toYearMonth } from '../common/year-month.js';
import { ProfileRepository } from './profile.repository.js';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  getProfile() {
    return this.profileRepository.findOwner();
  }

  getLinks(profileId: string) {
    return this.profileRepository.findLinks(profileId);
  }

  getSkills(profileId: string) {
    return this.profileRepository.findSkills(profileId);
  }

  async getExperience(profileId: string) {
    const experience = await this.profileRepository.findExperience(profileId);
    return experience.map((item) => ({
      ...item,
      startDate: toYearMonth(item.startDate),
      endDate: item.endDate === null ? null : toYearMonth(item.endDate),
    }));
  }

  getProjects(profileId: string) {
    return this.profileRepository.findProjects(profileId);
  }
}
