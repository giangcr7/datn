import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Đánh dấu route chỉ cho phép các role được liệt kê gọi.
 * Dùng chung với RolesGuard, PHẢI đặt sau JwtAuthGuard trong @UseGuards()
 * vì cần req.user đã được JwtAuthGuard gán trước đó.
 *
 * Ví dụ: @UseGuards(JwtAuthGuard, RolesGuard) @Roles('university')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
