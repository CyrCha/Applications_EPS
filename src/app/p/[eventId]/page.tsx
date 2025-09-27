"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Field } from "@/components/Field";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_public: boolean;
};

type SlotRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  window_id?: string | null;
};

type WindowRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  slot_duration_minutes: number;
};

export default function PublicBookingPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<Record<string, number>>({});
  const [bookedCounts, setBookedCounts] = useState<Record<string, number>>({});

  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [slotId, setSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const eventUrl = useMemo(() => {
    if (!eventId || typeof window === "undefined") return "";
    return `${window.location.origin}/p/${eventId}`;
  }, [eventId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: evt, error: evtErr } = await supabase
          .from("events")
          .select("id, title, description, location, starts_at, ends_at, is_public")
          .eq("id", eventId)
          .single();
        if (evtErr) throw evtErr;
        if (!(evt as EventRow).is_public) {
          throw new Error("Cet événement n'est pas public.");
        }

        const { data: s, error: sErr } = await supabase
          .rpc("available_slots", { p_event_id: eventId });
        if (sErr) throw sErr;

        // Load windows to display intervals/durations
        const { data: w, error: wErr } = await supabase
          .from("event_windows")
          .select("id, starts_at, ends_at, slot_duration_minutes")
          .eq("event_id", eventId)
          .order("starts_at", { ascending: true });
        if (wErr) throw wErr;

        if (!mounted) return;
        setEvent(evt as EventRow);
        const slotsData = (s ?? []) as SlotRow[];
        setSlots(slotsData);
        setWindows((w ?? []) as WindowRow[]);

        // Fetch capacities and booking counts for visible slots
        const slotIds = slotsData.map((x) => x.id);
        if (slotIds.length > 0) {
          try {
            const [{ data: ts }, { data: bs }] = await Promise.all([
              supabase.from('time_slots').select('id, capacity').in('id', slotIds),
              supabase.from('bookings').select('slot_id').in('slot_id', slotIds),
            ]);
            const capMap: Record<string, number> = {};
            for (const row of ts ?? []) capMap[row.id as string] = Math.max(1, Number(row.capacity ?? 1));
            setCaps(capMap);
            const counts: Record<string, number> = {};
            for (const b of bs ?? []) counts[b.slot_id as string] = (counts[b.slot_id as string] ?? 0) + 1;
            setBookedCounts(counts);
          } catch {
            // ignore if RLS denies; remaining hint won't be shown
          }
        } else {
          setCaps({});
          setBookedCounts({});
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (eventId) load();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!slotId) throw new Error("Veuillez choisir un créneau.");
      if (!parentName) throw new Error("Veuillez saisir votre nom.");
      if (!parentEmail) throw new Error("Veuillez saisir un e-mail.");

      const { error: insertErr } = await supabase.rpc(
        "create_booking",
        {
          p_slot_id: slotId,
          p_parent_email: parentEmail,
          p_parent_name: parentName,
        }
      );
      if (insertErr) {
        if (
          insertErr.message?.toLowerCase().includes("already booked") ||
          insertErr.code === "23505"
        ) {
          throw new Error(
            "Ce créneau vient d'être réservé. Merci d'en choisir un autre."
          );
        }
        throw insertErr;
      }

      setSuccess("Réservation confirmée ! Vous pouvez ajouter ce rendez-vous à votre calendrier.");
      const { data: s } = await supabase.rpc("available_slots", { p_event_id: eventId });
      const slotsData = (s ?? []) as SlotRow[];
      setSlots(slotsData);
      // refresh capacities and counts
      const slotIds = slotsData.map((x) => x.id);
      if (slotIds.length > 0) {
        try {
          const [{ data: ts }, { data: bs }] = await Promise.all([
            supabase.from('time_slots').select('id, capacity').in('id', slotIds),
            supabase.from('bookings').select('slot_id').in('slot_id', slotIds),
          ]);
          const capMap: Record<string, number> = {};
          for (const row of ts ?? []) capMap[row.id as string] = Math.max(1, Number(row.capacity ?? 1));
          setCaps(capMap);
          const counts: Record<string, number> = {};
          for (const b of bs ?? []) counts[b.slot_id as string] = (counts[b.slot_id as string] ?? 0) + 1;
          setBookedCounts(counts);
        } catch {
          // ignore
        }
      } else {
        setCaps({});
        setBookedCounts({});
      }
      const takenId = slotId;
      setSlotId("");

      const reserved = (slots ?? []).find((x) => x.id === takenId);
      if (reserved && event) {
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ParentTeacherMeetings//EN\nCALSCALE:GREGORIAN\nBEGIN:VEVENT\nUID:${reserved.id}@ptm\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')}\nDTSTART:${new Date(reserved.starts_at).toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')}\nDTEND:${new Date(reserved.ends_at).toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')}\nSUMMARY:${(event.title ?? 'RDV Parent–Professeur').replace(/\n/g, ' ')}\n${event.location ? `LOCATION:${event.location.replace(/\n/g, ' ')}` : ''}\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rdv-${reserved.id}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la réservation");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Chargement…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p>Événement introuvable.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          {event.description && (
            <p className="text-gray-700 text-sm">{event.description}</p>
          )}
          <div className="text-xs text-gray-500">
            {event.location && <div>Lieu: {event.location}</div>}
            {event.starts_at && (
              <div>Début: {new Date(event.starts_at).toLocaleString()}</div>
            )}
            {event.ends_at && (
              <div>Fin: {new Date(event.ends_at).toLocaleString()}</div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="truncate">Lien: {eventUrl}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => eventUrl && navigator.clipboard.writeText(eventUrl)}
              className="ml-auto"
            >
              Copier le lien
            </Button>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="font-medium">Choisir un créneau</h2>
          {slots.length === 0 ? (
            <div className="text-sm text-gray-700 border rounded-md p-3 bg-gray-50">
              <p className="mb-2">Tous les créneaux sont réservés ou indisponibles pour le moment.</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => eventUrl && navigator.clipboard.writeText(eventUrl)}>
                  Copier le lien de l&apos;événement
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                  Actualiser
                </Button>
              </div>
            </div>
          ) : (
            (() => {
              // Prefer grouping by window when available to show full interval and duration
              const byWindow = new Map<string, SlotRow[]>();
              const fallbacks: SlotRow[] = [];
              for (const s of slots) {
                if (s.window_id) {
                  const arr = byWindow.get(s.window_id) ?? [];
                  arr.push(s);
                  byWindow.set(s.window_id, arr);
                } else {
                  fallbacks.push(s);
                }
              }
              const winById = new Map(windows.map(w => [w.id, w] as const));

              return (
                <div className="space-y-6">
                  {[...byWindow.entries()]
                    .map(([winId, items]) => ({
                      winId,
                      items,
                      startAt: (() => {
                        const w = winById.get(winId);
                        return new Date(w ? w.starts_at : items[0].starts_at).getTime();
                      })(),
                    }))
                    .sort((a, b) => a.startAt - b.startAt)
                    .map(({ winId, items }) => {
                      const w = winById.get(winId);
                      const dateLabel = w ? new Date(w.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }) : new Date(items[0].starts_at).toLocaleDateString();
                      const startLabel = w ? new Date(w.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(items[0].starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const endLabel = w ? new Date(w.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(items[items.length-1].ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const dur = w?.slot_duration_minutes;
                      return (
                        <div key={winId} className="space-y-2">
                          <h3 className="text-sm font-medium text-gray-700">
                            {dateLabel} — {startLabel} → {endLabel}{dur ? ` — ${dur} min` : ''}
                          </h3>
                          <ul className="grid sm:grid-cols-2 gap-2">
                            {items
                              .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                              .map((s) => (
                                <li key={s.id}>
                                  <label className="flex items-center gap-2 border rounded-md p-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="slot"
                                      value={s.id}
                                      checked={slotId === s.id}
                                      onChange={(e) => setSlotId(e.target.value)}
                                    />
                                    <span>
                                      {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {" - "}
                                      {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {(() => {
                                        const cap = caps[s.id];
                                        const cnt = bookedCounts[s.id] ?? 0;
                                        return cap ? ` — restants: ${Math.max(0, cap - cnt)}` : '';
                                      })()}
                                    </span>
                                  </label>
                                </li>
                              ))}
                          </ul>
                        </div>
                      );
                    })}

                  {fallbacks.length > 0 && (() => {
                    const byDate = new Map<string, SlotRow[]>();
                    for (const s of fallbacks) {
                      const key = new Date(s.starts_at).toLocaleDateString();
                      const arr = byDate.get(key) ?? [];
                      arr.push(s);
                      byDate.set(key, arr);
                    }
                    return (
                      <div className="space-y-6">
                        {[...byDate.entries()]
                          .map(([date, items]) => ({
                            date,
                            items,
                            timestamp: new Date(items[0].starts_at).setHours(0,0,0,0),
                          }))
                          .sort((a, b) => a.timestamp - b.timestamp)
                          .map(({ date, items }) => {
                            const sorted = items.slice().sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
                            const startLabel = new Date(sorted[0].starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const endLabel = new Date(sorted[sorted.length - 1].ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const durMin = Math.max(5, Math.round((new Date(sorted[0].ends_at).getTime() - new Date(sorted[0].starts_at).getTime()) / 60000));
                            const dateLabel = new Date(sorted[0].starts_at).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
                            return (
                              <div key={date} className="space-y-2">
                                <h3 className="text-sm font-medium text-gray-700">{dateLabel} — {startLabel} → {endLabel} — {durMin} min</h3>
                                <ul className="grid sm:grid-cols-2 gap-2">
                                  {sorted.map((s) => (
                                    <li key={s.id}>
                                      <label className="flex items-center gap-2 border rounded-md p-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="slot"
                                          value={s.id}
                                          checked={slotId === s.id}
                                          onChange={(e) => setSlotId(e.target.value)}
                                        />
                                        <span>
                                          {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          {" - "}
                                          {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          {(() => {
                                            const cap = caps[s.id];
                                            const cnt = bookedCounts[s.id] ?? 0;
                                            return cap ? ` — restants: ${Math.max(0, cap - cnt)}` : '';
                                          })()}
                                        </span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
                </div>
              );
            })()
          )}
        </section>

        <section>
          <h2 className="font-medium mb-2">Vos informations</h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="flex gap-3">
              <Field className="flex-1" label="Nom">
                <Input
                  placeholder="Nom du parent"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
              </Field>
              <Field className="flex-1" label="Email">
                <Input
                  type="email"
                  required
                  placeholder="Email du parent"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                />
              </Field>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Réservation..." : "Réserver"}
            </Button>
            {success && <p className="text-green-600 text-sm">{success}</p>}
            {error && <p className="text-red-600 text-sm">{error}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
