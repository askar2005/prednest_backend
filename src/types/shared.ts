export type SortDirection = 'asc' | 'desc';

export type ListQuery = {
  page?: string;
  limit?: string;
  q?: string;
  sortBy?: string;
  sortDirection?: SortDirection;
  categoryId?: string;
  subjectId?: string;
  topicId?: string;
  status?: string;
  type?: string;
};
