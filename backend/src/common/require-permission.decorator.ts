import { SetMetadata } from '@nestjs/common';

/** 将接口需要的权限写入元数据，由 PermissionGuard 在请求阶段统一校验。 */
export const RequirePermission = (...permissions: string[]) => SetMetadata('permissions', permissions);
