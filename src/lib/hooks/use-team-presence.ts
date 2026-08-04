"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Who on this team has the app open, right now.
 *
 * Realtime Presence rather than a `last_seen` column: presence is held by the
 * socket itself, so someone who closes the app — or whose phone dies — drops
 * out on their own. A column would need a heartbeat to write it and a sweep to
 * expire it, and would still lie for as long as the sweep interval.
 *
 * It is deliberately NOT persisted anywhere. "Connecté" is a live fact about a
 * screen being open; storing it would invite reading it as availability.
 *
 * Same socket caveats as the orders feed (see driver-board): the JWT is set
 * before subscribing, and the channel is rebuilt when the tab comes back —
 * Chrome kills the heartbeat of a backgrounded tab, which drops presence.
 */
export function useTeamPresence(
  tenantId: string,
  profileId: string,
): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set([profileId]));

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let attempt = 0;

    async function connect() {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);

      // A fresh topic per attempt, so a reconnect never races the channel it
      // replaces — the same failure mode documented on the orders feed.
      attempt += 1;
      const ch = supabase.channel(`crew:${tenantId}:${attempt}`, {
        config: { presence: { key: profileId } },
      });
      channel = ch;

      ch.on("presence", { event: "sync" }, () => {
        // The reader is always in the set: their own screen is open by
        // definition, and presence state can lag its own join by a tick.
        setOnline(new Set([profileId, ...Object.keys(ch.presenceState())]));
      }).subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ch.track({ at: Date.now() });
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // A dead socket keeps its last presence state, which would leave the
          // whole team painted as connected for ever — the one lie this hook
          // must not tell. Drop everyone but the reader, then rebuild.
          setOnline(new Set([profileId]));
          const dying = channel;
          channel = null;
          // Detached from the callback that reported the failure: removing a
          // channel from inside its own handler re-enters supabase-js.
          setTimeout(() => {
            if (dying) void supabase.removeChannel(dying);
            if (!cancelled) void connect();
          }, 2000);
        }
      });
    }

    void connect();

    function onVisible() {
      if (document.visibilityState !== "visible" || cancelled || channel) return;
      void connect();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, profileId]);

  return online;
}
