import { ListQuery } from '../types/shared.js';

export function parsePagination(query: ListQuery) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
