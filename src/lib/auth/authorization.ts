import { UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { PermissionCodeType } from '@/lib/auth/permissions';

/**
 * Swanford Academy — Authorization Service
 * Master Specification Reference: Sections 2, 5, 6, 18, 25
 *
 * Core Principle:
 * ROLE != PERMISSION != SCOPE
 *
 * Authentication: "Who are you?"
 * Authorization:  "What are you allowed to do?" (Permission)
 * Scope:          "Which records/programmes/classes/subjects/children may you access?"
 */

export class AuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 403, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Asserts that an account is in a valid state to perform authorized actions.
 * Explicitly distinguishes:
 * - DEACTIVATED: Administrative revocation of all access.
 * - LOCKED: Temporary security cooldown after failed logins.
 * - SUSPENDED / PENDING_VERIFICATION: Inactive operational state.
 */
export function assertAccountActive(user: {
  status: UserStatus;
  lockedUntil?: Date | null;
}): void {
  if (user.status === UserStatus.DEACTIVATED) {
    throw new AuthorizationError(
      'Account has been administratively deactivated.',
      403,
      'ACCOUNT_DEACTIVATED'
    );
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new AuthorizationError(
      'Account has been suspended.',
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  if (user.status === UserStatus.PENDING_VERIFICATION) {
    throw new AuthorizationError(
      'Account has not yet been activated.',
      403,
      'ACCOUNT_PENDING_ACTIVATION'
    );
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new AuthorizationError(
      'Account is temporarily locked due to excessive failed login attempts.',
      423,
      'ACCOUNT_LOCKED'
    );
  }
}

/**
 * Loads the user's active permissions from the database.
 * Supports users with multiple roles, taking the union of all granted permissions.
 */
export async function getUserPermissions(
  userOrId: SafeUser | string
): Promise<Set<PermissionCodeType>> {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      lockedUntil: true,
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 401, 'USER_NOT_FOUND');
  }

  // Enforce account lifecycle invariant
  assertAccountActive(user);

  const permissions = new Set<PermissionCodeType>();

  for (const userRole of user.userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissions.add(rp.permission.code as PermissionCodeType);
    }
  }

  return permissions;
}

/**
 * Checks if a user possesses a specific fine-grained permission.
 */
export async function hasPermission(
  userOrId: SafeUser | string,
  permission: PermissionCodeType
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userOrId);
    return permissions.has(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return false;
    }
    throw error;
  }
}

/**
 * Strict server-side permission guard. Throws AuthorizationError if permission is missing.
 */
export async function requirePermission(
  userOrId: SafeUser | string,
  permission: PermissionCodeType
): Promise<void> {
  const permissions = await getUserPermissions(userOrId);

  if (!permissions.has(permission)) {
    throw new AuthorizationError(
      `Access denied: Missing required permission '${permission}'.`,
      403,
      'PERMISSION_DENIED'
    );
  }
}

/**
 * Strict server-side guard requiring at least one of the specified permissions.
 */
export async function requireAnyPermission(
  userOrId: SafeUser | string,
  permissions: PermissionCodeType[]
): Promise<void> {
  const userPermissions = await getUserPermissions(userOrId);

  const hasAny = permissions.some((p) => userPermissions.has(p));
  if (!hasAny) {
    throw new AuthorizationError(
      `Access denied: Requires at least one of [${permissions.join(', ')}].`,
      403,
      'PERMISSION_DENIED'
    );
  }
}

/**
 * Retrieves the list of assigned RoleCodes for a user.
 */
export async function getUserRoles(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });

  return userRoles.map((ur) => ur.role.code);
}
