import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Request } from 'express';
import { JwtGuard } from '../../../core/auth/jwt.guard';
import { AiConfigService } from './ai-config.service';

class SaveAiConfigDto {
  @IsString() provider!: string;
  @IsOptional() @IsString() base_url?: string;
  @IsString() api_key!: string;
  @IsString() model!: string;
  @IsNumber() @Min(0) @Max(2) temperature!: number;
  @IsNumber() @Min(1) max_tokens!: number;
  @IsBoolean() enabled!: boolean;
}

@Controller('settings/ai')
@UseGuards(JwtGuard)
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  getConfig() {
    return this.aiConfigService.getConfig();
  }

  @Put()
  saveConfig(@Body() dto: SaveAiConfigDto) {
    return this.aiConfigService.saveConfig(dto);
  }

  @Post('test')
  testConnection(@Req() request: Request) {
    const userId = this.getUserId(request);
    return this.aiConfigService.testConnection(userId);
  }

  @Get('logs')
  getLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.aiConfigService.getLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('usage')
  getUsage() {
    return this.aiConfigService.getUsage();
  }

  private getUserId(request: Request): number | null {
    const user = (request as Request & { user?: { sub?: number } }).user;
    return user?.sub ?? null;
  }
}
