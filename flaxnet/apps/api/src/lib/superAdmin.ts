export function isOwnerUserId(clerkUserId: string | undefined): boolean {
  const owner = process.env.OWNER_USER_ID?.trim();
  return Boolean(owner && clerkUserId && owner === clerkUserId);
}
