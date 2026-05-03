import { useMemo, useState } from "react";
import { AtSign, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mentionName, type MentionableUser } from "@/lib/mentions";

type MentionPickerProps = {
  users: MentionableUser[];
  disabled?: boolean;
  onSelect: (user: MentionableUser) => void;
};

export function MentionPicker({ users, disabled = false, onSelect }: MentionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const mentionableUsers = useMemo(() => users.filter((user) => mentionName(user)), [users]);
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mentionableUsers;

    return mentionableUsers.filter((user) =>
      [mentionName(user), user.role_label, user.subtitle].some((value) => value?.toLowerCase().includes(q)),
    );
  }, [mentionableUsers, query]);

  const selectUser = (user: MentionableUser) => {
    onSelect(user);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled || mentionableUsers.length === 0}>
          <AtSign className="h-3.5 w-3.5" />
          Mention
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recruiters or hiring managers"
            className="h-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredUsers.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matching people</div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => selectUser(user)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{mentionName(user)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[user.role_label, user.subtitle].filter(Boolean).join(" • ") || "Mentionable"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">@</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
