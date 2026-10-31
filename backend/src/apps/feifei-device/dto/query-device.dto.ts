import { IsString, IsOptional, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 查询设备列表请求 DTO */
export class QueryDeviceDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  productCode?: string;

  @IsString()
  @IsOptional()
  @IsIn(['discovered', 'online', 'offline', 'disabled'])
  status?: string;

  @IsString()
  @IsOptional()
  @IsIn(['bound', 'unbound'])
  bindingStatus?: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  pageSize?: number;
}
