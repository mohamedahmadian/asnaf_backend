import { Module } from '@nestjs/common';
import { StaffPostsController } from './staff-posts.controller';
import { StaffPostsService } from './staff-posts.service';

@Module({
  controllers: [StaffPostsController],
  providers: [StaffPostsService],
  exports: [StaffPostsService],
})
export class StaffPostsModule {}
