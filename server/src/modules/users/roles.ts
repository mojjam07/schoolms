export const ROLES = ['admin', 'teacher', 'student', 'parent'] as const;
export type Role = (typeof ROLES)[number];
