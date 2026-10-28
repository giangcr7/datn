import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('explicit role permissions', () => {
  function authorize(requiredRoles: string[] | undefined, role?: string) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    } as unknown as ExecutionContext;
    return new RolesGuard(reflector).canActivate(context);
  }

  it.each(['admin', 'student', 'employer', undefined])(
    'blocks %s from university-only operations',
    (role) => {
      expect(() => authorize(['university'], role)).toThrow(ForbiddenException);
    },
  );

  it('permits university-only operations for university staff', () => {
    expect(authorize(['university'], 'university')).toBe(true);
  });

  it.each(['admin', 'university'])(
    'permits %s on explicitly shared read endpoints',
    (role) => {
      expect(authorize(['admin', 'university'], role)).toBe(true);
    },
  );

  it.each(['university', 'student', 'employer'])(
    'blocks %s from admin-only operations',
    (role) => {
      expect(() => authorize(['admin'], role)).toThrow(ForbiddenException);
    },
  );

  it('preserves endpoints without role metadata', () => {
    expect(authorize(undefined, 'university')).toBe(true);
  });
});
