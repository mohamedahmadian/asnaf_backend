import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateStaffPostDto } from './dto/create-staff-post.dto';
import { FindStaffPostsQueryDto } from './dto/find-staff-posts-query.dto';
import { UpdateStaffPostDto } from './dto/update-staff-post.dto';
import { StaffPostsService } from './staff-posts.service';

@Controller('staff-posts')
export class StaffPostsController {
  constructor(private readonly staffPosts: StaffPostsService) {}

  @Get()
  findAll(@Query() query: FindStaffPostsQueryDto) {
    return this.staffPosts.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateStaffPostDto) {
    return this.staffPosts.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffPosts.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffPostDto) {
    return this.staffPosts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.staffPosts.remove(id);
  }
}
