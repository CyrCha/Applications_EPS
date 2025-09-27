"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Array<{ id: string; title: string; starts_at: string | null }>>([]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);

      // Onboarding: ensure a teacher profile exists for this user
      const userId = data.user?.id;
      if (userId) {
        await supabase.from("teachers").upsert(
          { user_id: userId },
          { onConflict: "user_id" }
        );

        // Load teacher's events
        const { data: evts } = await supabase
          .from("events")
          .select("id, title, starts_at")
          .order("created_at", { ascending: false });
        setEvents(evts ?? []);
      }

      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
    });

    init();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Chargement…</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">Espace professeur</h1>
          <p className="text-gray-600">Vous n&apos;êtes pas connecté.</p>
          <Link
            href="/auth"
            className="inline-block bg-black text-white rounded-md px-4 py-2"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{email}</span>
          <Button onClick={handleSignOut} variant="ghost" size="sm">Se déconnecter</Button>
        </div>
      </header>

      <main className="space-y-6">
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
                <li key={e.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-gray-600">
                      Début: {e.starts_at ? new Date(e.starts_at).toLocaleString() : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button href={`/dashboard/event/${e.id}`} variant="secondary" size="sm">Gérer</Button>
                    <Button href={`/p/${e.id}`} variant="ghost" size="sm">Ouvrir page publique</Button>
                    <Button
                      onClick={() => {
                        const url = `${window.location.origin}/p/${e.id}`;
                        navigator.clipboard.writeText(url);
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      Copier le lien
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
