import { supabase } from "@/integrations/supabase/client";

type SendInviteEmailInput = {
  email: string;
  inviteLink: string;
  role: string;
  workspaceName?: string | null;
};

export const sendInviteEmail = async ({ email, inviteLink, role, workspaceName }: SendInviteEmailInput) => {
  const { error } = await supabase.functions.invoke("send-invite-email", {
    body: { email, inviteLink, role, workspaceName },
  });

  return error;
};
