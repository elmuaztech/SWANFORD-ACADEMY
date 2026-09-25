import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { RoleCode, NotificationCategory, Prisma } from '@prisma/client';
import { enqueueNotification } from '@/lib/notifications/outbox';

export interface SendMessageInput {
  recipientUserId?: string;
  recipientRole?: RoleCode;
  schoolClassId?: string;
  parentMessageId?: string;
  subject: string;
  body: string;
}

export interface GetMessagesFilter {
  unreadOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Swanford Academy — Internal Messaging Service
 * Enforces strict communication matrix:
 * 1. Super Admin: Can message anyone (all staff, all parents, broadcast).
 * 2. Admin: Can message teachers and parents.
 * 3. Teacher: Can ONLY message Admins/Super Admin (cannot initiate message to parents directly).
 * 4. Parent: Receive-only via portal.
 */

export async function sendMessage(actor: SafeUser | string, input: SendMessageInput) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const sender = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!sender) {
    throw new AuthorizationError('Sender account not found.', 404, 'SENDER_NOT_FOUND');
  }

  const senderRoles = sender.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code);
  const isSuperAdmin = senderRoles.includes(RoleCode.SUPER_ADMIN);
  const isAdmin = senderRoles.includes(RoleCode.ADMIN);
  const isTeacher = senderRoles.includes(RoleCode.TEACHER);
  const isParentOnly = senderRoles.every((r: RoleCode) => r === RoleCode.PARENT);

  // Validate permission matrix
  if (isParentOnly) {
    throw new AuthorizationError(
      'Parents are not permitted to initiate direct internal messages. Please contact school administration via official channels.',
      403,
      'PARENT_MESSAGING_RESTRICTED'
    );
  }

  if (!input.subject || input.subject.trim().length === 0) {
    throw new AuthorizationError('Message subject is required.', 400, 'SUBJECT_REQUIRED');
  }

  if (!input.body || input.body.trim().length === 0) {
    throw new AuthorizationError('Message body cannot be empty.', 400, 'BODY_REQUIRED');
  }

  const isBroadcast = !input.recipientUserId && (Boolean(input.recipientRole) || Boolean(input.schoolClassId));

  // Teachers can only message Admins or Super Admins
  if (isTeacher && !isSuperAdmin && !isAdmin) {
    if (isBroadcast) {
      throw new AuthorizationError(
        'Teachers are not permitted to send broadcast messages.',
        403,
        'TEACHER_BROADCAST_RESTRICTED'
      );
    }

    if (!input.recipientUserId) {
      throw new AuthorizationError(
        'A recipient administrator must be specified.',
        400,
        'RECIPIENT_REQUIRED'
      );
    }

    const recipient = await prisma.user.findUnique({
      where: { id: input.recipientUserId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!recipient) {
      throw new AuthorizationError('Recipient not found.', 404, 'RECIPIENT_NOT_FOUND');
    }

    const recipientRoles = recipient.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code);
    const recipientIsAdminOrSuper = recipientRoles.includes(RoleCode.ADMIN) || recipientRoles.includes(RoleCode.SUPER_ADMIN);

    if (!recipientIsAdminOrSuper) {
      throw new AuthorizationError(
        'Teachers are only permitted to message school administrators and directors.',
        403,
        'TEACHER_RECIPIENT_RESTRICTED'
      );
    }
  }

  // Admins can only message Super Admin and Teachers (operational only, strictly no broadcast, no parent messaging)
  if (isAdmin && !isSuperAdmin) {
    if (isBroadcast) {
      throw new AuthorizationError(
        'Admins are not permitted to send broadcast messages. Broadcast is restricted to Super Admin.',
        403,
        'ADMIN_BROADCAST_RESTRICTED'
      );
    }

    if (!input.recipientUserId) {
      throw new AuthorizationError(
        'A recipient must be specified.',
        400,
        'RECIPIENT_REQUIRED'
      );
    }

    const recipient = await prisma.user.findUnique({
      where: { id: input.recipientUserId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!recipient) {
      throw new AuthorizationError('Recipient not found.', 404, 'RECIPIENT_NOT_FOUND');
    }

    const recipientRoles = recipient.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code);
    const recipientIsAllowed = recipientRoles.includes(RoleCode.SUPER_ADMIN) || recipientRoles.includes(RoleCode.TEACHER);

    if (!recipientIsAllowed) {
      throw new AuthorizationError(
        'Admins are only permitted to message Super Admin and Teachers for operational matters.',
        403,
        'ADMIN_RECIPIENT_RESTRICTED'
      );
    }
  }

  // If replying to a parent message, verify the thread exists
  if (input.parentMessageId) {
    const parentMsg = await prisma.internalMessage.findUnique({
      where: { id: input.parentMessageId },
    });

    if (!parentMsg) {
      throw new AuthorizationError('Parent message thread not found.', 404, 'THREAD_NOT_FOUND');
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.internalMessage.create({
      data: {
        senderUserId: actorUserId,
        recipientUserId: input.recipientUserId || null,
        recipientRole: input.recipientRole || null,
        schoolClassId: input.schoolClassId || null,
        parentMessageId: input.parentMessageId || null,
        subject: input.subject.trim(),
        body: input.body.trim(),
        isBroadcast,
      },
      include: {
        senderUser: {
          select: {
            id: true,
            email: true,
            userRoles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        recipientUser: {
          select: {
            id: true,
            email: true,
            userRoles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
      },
    });

    // Notify recipient user if direct message
    if (input.recipientUserId) {
      const recipient = await tx.user.findUnique({
        where: { id: input.recipientUserId },
        select: { email: true },
      });

      if (recipient?.email) {
        await enqueueNotification({
          idempotencyKey: `MSG-NOTIF-${created.id}-${input.recipientUserId}`,
          recipientUserId: input.recipientUserId,
          recipientEmail: recipient.email,
          category: NotificationCategory.GENERAL,
          templateName: 'SYSTEM_ANNOUNCEMENT',
          subject: `Swanford Academy: New Message - ${input.subject.trim()}`,
          bodyText: `You have received a new internal message from ${sender.email}:\n\nSubject: ${input.subject.trim()}\n\n${input.body.trim()}`,
          metadata: { messageId: created.id },
        }).catch((err) => {
          console.error('Failed to enqueue message notification:', err);
        });
      }
    }

    return created;
  });

  return message;
}

export async function getInbox(actor: SafeUser | string, filter?: GetMessagesFilter) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: { userRoles: { include: { role: true } } },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  const roleCodes = user.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code);

  const where: Prisma.InternalMessageWhereInput = {
    parentMessageId: null, // Only top-level threads in primary inbox
    OR: [
      { recipientUserId: actorUserId },
      {
        isBroadcast: true,
        OR: [
          { recipientRole: { in: roleCodes } },
          { recipientRole: null },
        ],
      },
    ],
  };

  if (filter?.unreadOnly) {
    where.isRead = false;
  }

  if (filter?.search && filter.search.trim().length > 0) {
    const term = filter.search.trim();
    where.AND = [
      {
        OR: [
          { subject: { contains: term, mode: 'insensitive' } },
          { body: { contains: term, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const limit = filter?.limit || 50;
  const offset = filter?.offset || 0;

  const [messages, totalCount] = await Promise.all([
    prisma.internalMessage.findMany({
      where,
      include: {
        senderUser: {
          select: {
            id: true,
            email: true,
            userRoles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        recipientUser: {
          select: {
            id: true,
            email: true,
            userRoles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.internalMessage.count({ where }),
  ]);

  return { messages, totalCount };
}

export async function getSentMessages(actor: SafeUser | string, filter?: GetMessagesFilter) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const where: Prisma.InternalMessageWhereInput = {
    senderUserId: actorUserId,
    parentMessageId: null,
  };

  if (filter?.search && filter.search.trim().length > 0) {
    const term = filter.search.trim();
    where.AND = [
      {
        OR: [
          { subject: { contains: term, mode: 'insensitive' } },
          { body: { contains: term, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const limit = filter?.limit || 50;
  const offset = filter?.offset || 0;

  const [messages, totalCount] = await Promise.all([
    prisma.internalMessage.findMany({
      where,
      include: {
        recipientUser: {
          select: {
            id: true,
            email: true,
            userRoles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        schoolClass: { select: { id: true, name: true, code: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.internalMessage.count({ where }),
  ]);

  return { messages, totalCount };
}

export async function getMessageThread(actor: SafeUser | string, messageId: string) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const message = await prisma.internalMessage.findUnique({
    where: { id: messageId },
    include: {
      senderUser: {
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { code: true, name: true } } } },
        },
      },
      recipientUser: {
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { code: true, name: true } } } },
        },
      },
      replies: {
        include: {
          senderUser: {
            select: {
              id: true,
              email: true,
              userRoles: { select: { role: { select: { code: true, name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!message) {
    throw new AuthorizationError('Message not found.', 404, 'MESSAGE_NOT_FOUND');
  }

  // Authorization: must be sender, recipient, or have matching broadcast role
  const isSender = message.senderUserId === actorUserId;
  const isRecipient = message.recipientUserId === actorUserId;

  const actorUser = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: { userRoles: { include: { role: true } } },
  });
  const actorRoles = actorUser?.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code) || [];

  const isBroadcastRecipient =
    message.isBroadcast &&
    (!message.recipientRole || actorRoles.includes(message.recipientRole));

  if (!isSender && !isRecipient && !isBroadcastRecipient && !actorRoles.includes(RoleCode.SUPER_ADMIN)) {
    throw new AuthorizationError('You are not authorized to view this message thread.', 403, 'ACCESS_DENIED');
  }

  // Mark as read if actor is the recipient and message is unread
  if ((isRecipient || isBroadcastRecipient) && !message.isRead) {
    await prisma.internalMessage.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });
    message.isRead = true;
    message.readAt = new Date();
  }

  return message;
}

export async function getUnreadMessageCount(actor: SafeUser | string): Promise<number> {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: { userRoles: { include: { role: true } } },
  });

  if (!user) return 0;
  const roleCodes = user.userRoles.map((r: { role: { code: RoleCode } }) => r.role.code);

  return prisma.internalMessage.count({
    where: {
      isRead: false,
      parentMessageId: null,
      OR: [
        { recipientUserId: actorUserId },
        {
          isBroadcast: true,
          OR: [
            { recipientRole: { in: roleCodes } },
            { recipientRole: null },
          ],
        },
      ],
    },
  });
}

export async function markMessageAsRead(actor: SafeUser | string, messageId: string) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  const message = await prisma.internalMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    throw new AuthorizationError('Message not found.', 404, 'MESSAGE_NOT_FOUND');
  }

  return prisma.internalMessage.update({
    where: { id: messageId },
    data: { isRead: true, readAt: new Date() },
  });
}
