import { PartialType } from '@nestjs/mapped-types';
import { CreateJobCatalogDto } from './create-job-catalog.dto';

export class UpdateJobCatalogDto extends PartialType(CreateJobCatalogDto) {}
