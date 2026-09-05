"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { CopyButton } from "@/components/CopyButton";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { formatDateTime } from "@/lib/datetime";
import { isSupabaseConfigured, SUPABASE_CONFIG_ERROR, supabase } from "@/lib/supabaseClient";

type EventSummary = { id: string; title: string; starts_at: string | null; is_public: boolean | null };

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(SUPABASE_CONFIG_ERROR);
      setLoading(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        setEmail(data.user?.email ?? null);

        const userId = data.user?.id;
        if (!userId) return;

        // Onboarding: ensure a teacher profile exists for this user
        await supabase.from("teachers").upsert({ user_id: userId }, { onConflict: "user_id" });

        const { data: evts, error: evtErr } = await supabase
          .from("events")
          .select("id, title, starts_at, is_public")
          .order("created_at", { ascending: false });
        if (evtErr) throw evtErr;
        if (!mounted) return;
        setEvents((evts ?? []) as EventSummary[]);
      } catch (err: unknown) {
        if (mounted) setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setEmail(session?.user?.email ?? null);
    });

    init();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (!email) {
    return (
      <div className="py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold">Espace professeur</h1>
        <p className="text-gray-600">Vous n&apos;êtes pas connecté.</p>
        <div>
          <Button href="/auth">Se connecter</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{email}</span>
          <Button onClick={() => supabase.auth.signOut()} variant="ghost" size="sm">
            Se déconnecter
          </Button>
        </div>
      </header>

      <p>Créez un événement puis partagez le lien public aux parents. Suivez et gérez les réservations en temps réel.</p>
      <div>
        <Button href="/dashboard/new-event">Créer un événement</Button>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Mes événements</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun événement pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>
                  <div className="font-medium">
                    {e.title}
                    {!e.is_public && (
                      <span className="ml-2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                        privé
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    Début: {e.starts_at ? formatDateTime(e.starts_at) : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button href={`/dashboard/event/${e.id}`} variant="secondary" size="sm">
                    Gérer
                  </Button>
                  <Button href={`/p/${e.id}`} variant="ghost" size="sm">
                    Ouvrir page publique
                  </Button>
                  <CopyButton value={origin ? `${origin}/p/${e.id}` : ""} variant="ghost" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
