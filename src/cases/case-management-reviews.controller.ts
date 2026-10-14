import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { hasPermission } from '../access/access.util';
import { CaseInquiryChannel } from '../generated/prisma/client';
import { CaseManagementApproversService, type ManagementDecideActor } from './case-management-approvers.service';
import { CaseManagementReviewsReportService } from './case-management-reviews-report.service';
import { FindManagementReviewsQueryDto } from './dto/find-management-reviews-query.dto';
import { PlacesReportQueryDto } from './dto/places-report-query.dto';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

type RequestUser = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
};

function actorOf(user: RequestUser | undefined): ManagementDecideActor {
  if (!user?.id) throw new UnauthorizedException();
  return {
    id: user.id,
    isAdmin: user.isAdmin,
    formation: false,
  };
}

const reviewFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

@Controller('cases/management-reviews')
export class CaseManagementReviewsController {
  constructor(
    private readonly reviews: CaseManagementApproversService,
    private readonly reports: CaseManagementReviewsReportService,
  ) {}

  @Get()
  inbox(@CurrentUser() user: RequestUser | undefined, @Query() query: FindManagementReviewsQueryDto) {
    return this.reviews.inbox(actorOf(user), query);
  }

  @Get('stats')
  stats(@CurrentUser() user: RequestUser | undefined) {
    return this.reviews.stats(actorOf(user));
  }

  @Get('report')
  performance(@CurrentUser() user: RequestUser | undefined, @Query() query: PlacesReportQueryDto) {
    const actor = actorOf(user);
    const access = { isAdmin: Boolean(actor.isAdmin), permissionCodes: user?.permissionCodes ?? [] };
    const wide = Boolean(actor.isAdmin) || hasPermission(access, 'cases.management');
    return this.reports.build(actor.id, query, wide);
  }

  @Post(':id/decision')
  @UseInterceptors(reviewFile)
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const saved = await this.reviews.decide(id, actorOf(user), {
      status,
      note,
      channel: CaseInquiryChannel.MANUAL,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
    await this.reviews.advanceAfterDecision(id);
    return saved;
  }
}
