import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ProfileService } from './profile.service.js';
import {
  ExperienceModel,
  ProfessionalLinkModel,
  ProfileModel,
  ProjectModel,
  SkillModel,
} from './profile.models.js';

@Resolver(() => ProfileModel)
export class ProfileResolver {
  constructor(private readonly profileService: ProfileService) {}

  @Query(() => ProfileModel, {
    nullable: true,
    description: 'The owner of this developer profile.',
  })
  profile() {
    return this.profileService.getProfile();
  }

  @ResolveField(() => [ProfessionalLinkModel])
  links(@Parent() profile: ProfileModel) {
    return this.profileService.getLinks(profile.id);
  }

  @ResolveField(() => [SkillModel])
  skills(@Parent() profile: ProfileModel) {
    return this.profileService.getSkills(profile.id);
  }

  @ResolveField(() => [ExperienceModel])
  experience(@Parent() profile: ProfileModel) {
    return this.profileService.getExperience(profile.id);
  }

  @ResolveField(() => [ProjectModel])
  projects(@Parent() profile: ProfileModel) {
    return this.profileService.getProjects(profile.id);
  }
}
