import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { ViolationsController } from './violations.controller';
import { ViolationsService } from './violations.service';

@Module({
  imports: [ImagesModule],
  controllers: [ViolationsController],
  providers: [ViolationsService],
})
export class ViolationsModule {}
