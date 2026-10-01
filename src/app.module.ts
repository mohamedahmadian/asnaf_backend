import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessModule } from './access/access.module';
import { PermissionsGuard } from './access/permissions.guard';
import { AuthModule } from './auth/auth.module';
import { JwtUserGuard } from './auth/jwt-user.guard';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { CasesModule } from './cases/cases.module';
import { CommercialComplexesModule } from './commercial-complexes/commercial-complexes.module';
import { DiscountsModule } from './discounts/discounts.module';
import { DocumentsModule } from './documents/documents.module';
import { StaffPostsModule } from './staff-posts/staff-posts.module';
import { GeoModule } from './geo/geo.module';
import { ImagesModule } from './images/images.module';
import { InquiryCentersModule } from './inquiry-centers/inquiry-centers.module';
import { JobGroupsModule } from './job-groups/job-groups.module';
import { JobTypesModule } from './job-types/job-types.module';
import { MunicipalFeesModule } from './municipal-fees/municipal-fees.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationPlacesModule } from './registration-places/registration-places.module';
import { RolesModule } from './roles/roles.module';
import { SmsModule } from './sms/sms.module';
import { UsersModule } from './users/users.module';
import { ViolationTypesModule } from './violation-types/violation-types.module';
import { ViolationsModule } from './violations/violations.module';
import { WorkUnitsModule } from './work-units/work-units.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    RolesModule,
    GeoModule,
    BankAccountsModule,
    CasesModule,
    MunicipalFeesModule,
    DiscountsModule,
    JobTypesModule,
    InquiryCentersModule,
    JobGroupsModule,
    RegistrationPlacesModule,
    DocumentsModule,
    WorkUnitsModule,
    StaffPostsModule,
    ViolationTypesModule,
    ViolationsModule,
    CommercialComplexesModule,
    OrganizationModule,
    ImagesModule,
    SmsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtUserGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
