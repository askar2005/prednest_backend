import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

export interface DiscussionAuthor {
  id: string;
  role: string;
}

interface CommentWithAuthor {
  id: string;
  content: string;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  userId: string | null;
  adminId: string | null;
  user?: { name: string } | null;
  admin?: { fullName: string; displayName: string | null } | null;
  parent?: { id: string; parentId: string | null } | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function normalizePage(query: { page?: unknown; limit?: unknown }): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

function authorName(c: CommentWithAuthor): string {
  if (c.admin) return c.admin.displayName || c.admin.fullName || 'Admin';
  return c.user?.name || 'Deleted user';
}

function serialize(c: CommentWithAuthor, replyCount = 0, depth?: number) {
  const out: Record<string, unknown> = {
    id: c.id,
    content: c.content,
    isEdited: c.isEdited,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    parentId: c.parentId,
    replyCount,
    author: {
      id: c.adminId ?? c.userId,
      type: c.adminId ? 'admin' : 'user',
      name: authorName(c),
    },
  };
  if (depth !== undefined) out.depth = depth;
  return out;
}

const authorInclude = {
  user: { select: { name: true } },
  admin: { select: { fullName: true, displayName: true } },
} as const;

async function assertTopicExists(topicId: string) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) throw new AppError('Topic not found', 404);
}

async function getOrCreateThread(topicId: string) {
  const existing = await prisma.discussionThread.findUnique({ where: { topicId } });
  if (existing) return existing;
  return prisma.discussionThread.create({ data: { topicId } });
}

export const discussionService = {
  /** Top-level comments for a topic, paginated (20 default). */
  async list(topicId: string, query: { page?: unknown; limit?: unknown } = {}) {
    await assertTopicExists(topicId);
    const thread = await prisma.discussionThread.findUnique({ where: { topicId } });
    if (!thread) return { items: [], total: 0, page: 1, limit: DEFAULT_LIMIT };

    const { page, limit, skip } = normalizePage(query);
    const where = { threadId: thread.id, parentId: null };
    const [items, total] = await Promise.all([
      prisma.discussionComment.findMany({
        where,
        include: authorInclude,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.discussionComment.count({ where }),
    ]);

    const counts = await this.replyCounts(thread.id, items.map((i) => i.id));
    return {
      items: items.map((i) => serialize(i, counts.get(i.id) ?? 0)),
      total,
      page,
      limit,
    };
  },

  /** Total descendant replies per top-level comment (2 bounded levels, no N+1). */
  async replyCounts(threadId: string, commentIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (commentIds.length === 0) return map;

    const direct = await prisma.discussionComment.findMany({
      where: { threadId, parentId: { in: commentIds } },
      select: { id: true, parentId: true },
    });
    const byRoot = new Map<string, number>();
    for (const r of direct) byRoot.set(r.parentId!, (byRoot.get(r.parentId!) ?? 0) + 1);

    const nested = await prisma.discussionComment.groupBy({
      by: ['parentId'],
      where: { threadId, parentId: { in: direct.map((r) => r.id) } },
      _count: { _all: true },
    });
    const replyToRoot = new Map(direct.map((r) => [r.id, r.parentId!] as const));
    for (const g of nested) {
      const root = replyToRoot.get(g.parentId!);
      if (root) byRoot.set(root, (byRoot.get(root) ?? 0) + g._count._all);
    }

    for (const id of commentIds) {
      const n = byRoot.get(id);
      if (n) map.set(id, n);
    }
    return map;
  },

  /** Nested replies of a comment (depth 1 direct, depth 2 reply-to-reply), paginated. */
  async replies(commentId: string, query: { page?: unknown; limit?: unknown } = {}) {
    const comment = await prisma.discussionComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError('Comment not found', 404);
    if (comment.parentId) throw new AppError('Replies are listed under their parent comment', 400);

    const { page, limit, skip } = normalizePage(query);
    const where = {
      threadId: comment.threadId,
      OR: [{ parentId: commentId }, { parent: { parentId: commentId } }],
    };
    const [items, total] = await Promise.all([
      prisma.discussionComment.findMany({
        where,
        include: authorInclude,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.discussionComment.count({ where }),
    ]);

    return {
      items: items.map((i) => serialize(i, 0, i.parentId === commentId ? 1 : 2)),
      total,
      page,
      limit,
    };
  },

  /** Create a top-level comment. Author is a student (user) or admin. */
  async create(topicId: string, author: DiscussionAuthor, content: string) {
    await assertTopicExists(topicId);
    const thread = await getOrCreateThread(topicId);
    const comment = await prisma.discussionComment.create({
      data: {
        threadId: thread.id,
        userId: author.role === 'ADMIN' ? null : author.id,
        adminId: author.role === 'ADMIN' ? author.id : null,
        content,
      },
      include: authorInclude,
    });
    return serialize(comment);
  },

  /** Reply to a comment (or to a reply — replies stay bounded to 2 levels under the root). */
  async reply(commentId: string, author: DiscussionAuthor, content: string) {
    const target = await prisma.discussionComment.findUnique({
      where: { id: commentId },
      include: { parent: { select: { id: true, parentId: true } } },
    });
    if (!target) throw new AppError('Comment not found', 404);

    const parentId = !target.parentId || !target.parent?.parentId ? commentId : target.parentId;
    const comment = await prisma.discussionComment.create({
      data: {
        threadId: target.threadId,
        userId: author.role === 'ADMIN' ? null : author.id,
        adminId: author.role === 'ADMIN' ? author.id : null,
        parentId,
        content,
      },
      include: authorInclude,
    });
    return serialize(comment);
  },

  /** Edit. Students may edit only their own; admins only their own admin comments. */
  async update(commentId: string, author: DiscussionAuthor, content: string) {
    const comment = await prisma.discussionComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError('Comment not found', 404);

    if (author.role === 'ADMIN') {
      if (comment.adminId !== author.id) throw new AppError('You can only edit your own admin comments', 403);
    } else if (comment.userId !== author.id) {
      throw new AppError('You can only edit your own comments', 403);
    }

    const updated = await prisma.discussionComment.update({
      where: { id: commentId },
      data: { content, isEdited: true },
      include: authorInclude,
    });
    return serialize(updated);
  },

  /** Delete. Students may delete only their own; admins may delete any comment. */
  async remove(commentId: string, author?: DiscussionAuthor) {
    const comment = await prisma.discussionComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError('Comment not found', 404);

    if (author && author.role !== 'ADMIN' && comment.userId !== author.id) {
      throw new AppError('You can only delete your own comments', 403);
    }

    await prisma.discussionComment.delete({ where: { id: commentId } });
    return { success: true };
  },
};
