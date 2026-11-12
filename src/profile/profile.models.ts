import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('ProfessionalLink')
export class ProfessionalLinkModel {
  @Field(() => ID) id!: string;
  @Field(() => String) label!: string;
  @Field(() => String) url!: string;
}

@ObjectType('Skill')
export class SkillModel {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
}

@ObjectType('Experience')
export class ExperienceModel {
  @Field(() => ID) id!: string;
  @Field(() => String) company!: string;
  @Field(() => String) position!: string;
  @Field(() => String, { description: 'Start month, YYYY-MM.' })
  startDate!: string;
  @Field(() => String, {
    nullable: true,
    description: 'End month, YYYY-MM; null for current work.',
  })
  endDate!: string | null;
  @Field(() => [String]) achievements!: string[];
}

@ObjectType('Project')
export class ProjectModel {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String) url!: string;
}

@ObjectType('Profile')
export class ProfileModel {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String) description!: string;
  @Field(() => [ProfessionalLinkModel]) links!: ProfessionalLinkModel[];
  @Field(() => [SkillModel]) skills!: SkillModel[];
  @Field(() => [ExperienceModel]) experience!: ExperienceModel[];
  @Field(() => [ProjectModel]) projects!: ProjectModel[];
}
