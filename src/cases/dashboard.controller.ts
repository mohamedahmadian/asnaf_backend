import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaseInquiriesService, type InquiryActor } from './case-inquiries.service';

type RequestUser = {
  id: string;
  isAdmin?: boolean;
};

function actorOf(user: RequestUser | undefined): InquiryActor {
  if (!user?.id) throw new UnauthorizedException();
  return { id: user.id, isAdmin: user.isAdmin };
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly inquiries: CaseInquiriesService) {}

  @Get('summary')
  summary(@CurrentUser() user: RequestUser | undefined) {
    return this.inquiries.summary(actorOf(user));
  }
}
