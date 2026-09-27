import { PartialType } from '@nestjs/mapped-types';
import { CreateJobGroupDto } from './create-job-group.dto';

export class UpdateJobGroupDto extends PartialType(CreateJobGroupDto) {}
