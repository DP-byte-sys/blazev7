import type { TicketPriority } from './labels';

export const LIMITS = { title: 200, description: 5000 } as const; // mirror the server (create_ticket); the server is authoritative

export interface DraftFields {
  categoryId: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
}
export interface FieldErrors {
  title?: string;
  description?: string;
  category?: string;
}

export function validateDraft(d: DraftFields): FieldErrors {
  const errors: FieldErrors = {};
  const title = d.title.trim();
  const description = d.description.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > LIMITS.title)
    errors.title = `Title must be ${LIMITS.title} characters or fewer.`;
  if (!description) errors.description = 'Description is required.';
  else if (description.length > LIMITS.description)
    errors.description = `Description must be ${LIMITS.description} characters or fewer.`;
  if (!d.categoryId) errors.category = 'Choose a category.';
  return errors;
}
export const hasErrors = (e: FieldErrors) => Object.keys(e).length > 0;
