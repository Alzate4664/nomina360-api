import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPlatformUser } from '../../common/types/authenticated-user.type';
import { CreatePayrollRuleSetDraftDto } from './dto/create-payroll-rule-set-draft.dto';
import { EditPayrollRuleSetDraftDto } from './dto/edit-payroll-rule-set-draft.dto';
import { PayrollRuleSetIdParamDto } from './dto/payroll-rule-set-id-param.dto';
import {
  PayrollRuleSetDraftCreationError,
  PayrollRuleSetDraftCreationService,
} from './payroll-rule-set-draft-creation.service';
import {
  PayrollRuleSetDraftEditingError,
  PayrollRuleSetDraftEditingService,
} from './payroll-rule-set-draft-editing.service';
import { PayrollRuleSetDomainError } from './domain/payroll-rule-set.errors';
import { PayrollRulesPayloadValidationError } from './payroll-rules-codec';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformScopeGuard } from '../../common/guards/platform-scope.guard';
import { ListPayrollRuleSetsQueryDto } from './dto/list-payroll-rule-sets-query.dto';
import {
  PayrollRuleSetDraftQueryError,
  PayrollRuleSetQueryService,
} from './payroll-rule-set-query.service';

@ApiTags('Platform Payroll Rule Sets')
@ApiBearerAuth()
@Controller('platform/payroll-rule-sets')
@UseGuards(JwtAuthGuard, PlatformScopeGuard)
export class PlatformPayrollRuleSetsController {
  constructor(
    private readonly queryService: PayrollRuleSetQueryService,
    private readonly creationService: PayrollRuleSetDraftCreationService,
    private readonly editingService: PayrollRuleSetDraftEditingService,
  ) {}

  @Get()
  findAll(@Query() query: ListPayrollRuleSetsQueryDto) {
    return this.queryService.findAll({
      jurisdictionCode: query.jurisdictionCode,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Post('drafts')
  async createDraft(
    @Body() body: CreatePayrollRuleSetDraftDto,
    @CurrentUser() user: AuthenticatedPlatformUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = this.actorId(user);
    try {
      const result = await this.creationService.createDraft(
        {
          jurisdictionCode: body.jurisdictionCode,
          schemaVersion: body.schemaVersion,
          rulesPayload: body.rulesPayload,
          approvedEffectiveFrom: body.approvedEffectiveFrom,
          approvedEffectiveTo: body.approvedEffectiveTo,
        },
        actor,
      );
      response.setHeader(
        'Location',
        `/platform/payroll-rule-sets/drafts/${result.id}`,
      );
      return result;
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get('drafts/:id')
  async findDraftDetail(@Param() params: PayrollRuleSetIdParamDto) {
    try {
      return await this.queryService.findDraftDetail(params.id);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Put('drafts/:id')
  async editDraft(
    @Param() params: PayrollRuleSetIdParamDto,
    @Body() body: EditPayrollRuleSetDraftDto,
    @CurrentUser() user: AuthenticatedPlatformUser,
  ) {
    const actor = this.actorId(user);
    try {
      return await this.editingService.editDraft(
        {
          ruleSetId: params.id,
          expectedDraftRevision: body.expectedDraftRevision,
          schemaVersion: body.schemaVersion,
          rulesPayload: body.rulesPayload,
          approvedEffectiveFrom: body.approvedEffectiveFrom,
          approvedEffectiveTo: body.approvedEffectiveTo,
        },
        actor,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  private actorId(user: AuthenticatedPlatformUser): string {
    if (typeof user?.sub !== 'string' || !user.sub.trim())
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_ACTOR_USER_ID',
        message: 'Authentication required.',
      });
    return user.sub;
  }

  private mapError(error: unknown): never {
    let code = 'INTERNAL_SERVER_ERROR';
    let statusCode = 500;
    if (error instanceof PayrollRulesPayloadValidationError) {
      code = 'INVALID_RULES_PAYLOAD';
      statusCode = 422;
    } else if (
      error instanceof PayrollRuleSetDraftCreationError ||
      error instanceof PayrollRuleSetDraftEditingError ||
      error instanceof PayrollRuleSetDraftQueryError ||
      error instanceof PayrollRuleSetDomainError
    ) {
      const statuses: Record<string, number> = {
        INVALID_CREATE_INPUT: 400,
        INVALID_EDIT_INPUT: 400,
        INVALID_JURISDICTION: 400,
        INVALID_RULE_SET_ID: 400,
        INVALID_EXPECTED_DRAFT_REVISION: 400,
        INVALID_ACTOR_USER_ID: 401,
        PLATFORM_ACTOR_UNAUTHORIZED: 403,
        RULE_SET_NOT_FOUND: 404,
        RULE_SET_NOT_DRAFT: 409,
        STALE_DRAFT_REVISION: 409,
        DRAFT_REVISION_EXHAUSTED: 409,
        VERSION_EXHAUSTED: 409,
        VERSION_ALLOCATION_CONFLICT: 409,
        INVALID_BUSINESS_DATE: 422,
        INVALID_APPROVED_TEMPORAL_ENVELOPE: 422,
        INVALID_CANONICAL_CONTENT: 422,
        DRAFT_EDIT_INVARIANT_VIOLATION: 500,
      };
      if (Object.hasOwn(statuses, error.code)) {
        code = error.code;
        statusCode = statuses[code];
      }
    }
    const messages: Record<number, string> = {
      400: 'Invalid request.',
      401: 'Authentication required.',
      403: 'Platform access denied.',
      404: 'Draft rule set not found.',
      409: 'Draft rule set conflict.',
      422: 'Invalid draft content.',
      500: 'Internal server error.',
    };
    throw new HttpException(
      { statusCode, code, message: messages[statusCode] },
      statusCode,
    );
  }
}
