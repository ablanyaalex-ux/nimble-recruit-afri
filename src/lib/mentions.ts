export type MentionableUser = {
  id: string;
  display_name: string | null;
  role_label?: string;
  subtitle?: string | null;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const mentionName = (user: MentionableUser) => user.display_name?.trim() ?? "";

export const mentionText = (user: MentionableUser) => `@${mentionName(user)}`;

export const parseMentionedUserIds = (text: string, users: MentionableUser[], currentUserId?: string | null) => {
  const mentioned = new Set<string>();

  for (const user of users) {
    const name = mentionName(user);
    if (!name || user.id === currentUserId) continue;

    const re = new RegExp(`(^|\\s)@${escapeRegex(name)}(?=$|\\s|[.,!?;:)])`, "i");
    if (re.test(text)) mentioned.add(user.id);
  }

  return Array.from(mentioned);
};

export const appendMention = (value: string, user: MentionableUser) => {
  const name = mentionName(user);
  if (!name) return value;

  const prefix = value.length > 0 && !/\s$/.test(value) ? `${value} ` : value;
  return `${prefix}@${name} `;
};
