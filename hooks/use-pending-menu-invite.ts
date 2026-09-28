import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@/store/auth";
import { loadData, saveData } from "@/store/storage";
import { cachedWorkspaceConfig } from "@/store/workspace";
export function usePendingMenuInvite() {
  const { status } = useAuth();
  useEffect(() => {
    let alive = true;
    if (status === "authed")
      void loadData<{ ws: string; t: string } | null>(
        "pending_menu_invite",
        null,
      ).then(async (pending) => {
        if (
          alive &&
          pending &&
          cachedWorkspaceConfig()?.origin === pending.ws
        ) {
          await saveData("pending_menu_invite", null);
          if (alive)
            router.push({ pathname: "/menu-invite", params: pending } as never);
        }
      });
    return () => {
      alive = false;
    };
  }, [status]);
}
