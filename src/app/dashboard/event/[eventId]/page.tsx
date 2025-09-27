"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  slot_duration_minutes: number | null;
  teacher_id: string;
  is_public: boolean | null;
};

type SlotRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  window_id?: string | null;
  capacity?: number | null;
};

type BookingRow = {
  id: string;
  slot_id: string;
  parent_email: string;
  parent_name: string | null;
  created_at: string;
};

type WindowRow = {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  slot_duration_minutes: number;
};

export default function ManageEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const router = useRouter();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<string | null>(null);
  const [editIsPublic, setEditIsPublic] = useState<boolean>(false);
  const [editDate, setEditDate] = useState<string>("");
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editDuration, setEditDuration] = useState<number>(10);
  const [showHelp, setShowHelp] = useState(false);

  const publicUrl = useMemo(() => {
    if (!eventId || typeof window === "undefined") return "";
    return `${window.location.origin}/p/${eventId}`;
  }, [eventId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // Ensure user is logged
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
          router.replace("/auth");
          return;
        }
        // auth.user.email is not used in this page

        // Load event (must belong to teacher via RLS)
        const { data: evt, error: evtErr } = await supabase
          .from("events")
          .select("id, title, description, location, starts_at, ends_at, slot_duration_minutes, teacher_id, is_public")
          .eq("id", eventId)
          .single();
        if (evtErr) throw evtErr;

        // Load slots
        const { data: s, error: sErr } = await supabase
          .from("time_slots")
          .select("id, starts_at, ends_at, window_id, capacity")
          .eq("event_id", eventId)
          .order("starts_at", { ascending: true });
        if (sErr) throw sErr;

        // Load windows for the event
        const { data: w, error: wErr } = await supabase
          .from("event_windows")
          .select("id, event_id, starts_at, ends_at, slot_duration_minutes")
          .eq("event_id", eventId)
          .order("starts_at", { ascending: true });
        if (wErr) throw wErr;

        // Load bookings for those slots
        const slotIds = (s ?? []).map((x) => x.id);
        let b: BookingRow[] = [];
        if (slotIds.length > 0) {
          const { data: bData, error: bErr } = await supabase
            .from("bookings")
            .select("id, slot_id, parent_email, parent_name, created_at")
            .in("slot_id", slotIds);
          if (bErr) throw bErr;
          b = (bData ?? []) as BookingRow[];
        }

        if (!mounted) return;
        setEvent(evt as EventRow);
        setSlots((s ?? []) as SlotRow[]);
        setBookings(b);
        setWindows((w ?? []) as WindowRow[]);
        // Initialize editable state from loaded event
        const ev = evt as EventRow;
        setEditTitle(ev.title);
        setEditDescription(ev.description);
        setEditLocation(ev.location);
        setEditIsPublic(Boolean(ev.is_public));
        // Build local date/time strings
        if (ev.starts_at) {
          const d = new Date(ev.starts_at);
          setEditDate(d.toISOString().slice(0,10));
          setEditStart(d.toTimeString().slice(0,5));
        }
        if (ev.ends_at) {
          const e = new Date(ev.ends_at);
          setEditEnd(e.toTimeString().slice(0,5));
        }
        setEditDuration(ev.slot_duration_minutes ?? 10);
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
  }, [eventId, router]);

  // Realtime: refresh bookings when a booking is inserted/deleted
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`bookings-event-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        async () => {
          // Re-fetch slots and bookings
          const { data: s } = await supabase
            .from("time_slots")
            .select("id, starts_at, ends_at, window_id, capacity")
            .eq("event_id", eventId)
            .order("starts_at", { ascending: true });
          setSlots((s ?? []) as SlotRow[]);
          const slotIds = (s ?? []).map((x) => x.id);
          if (slotIds.length > 0) {
            const { data: b } = await supabase
              .from("bookings")
              .select("id, slot_id, parent_email, parent_name, created_at")
              .in("slot_id", slotIds);
            setBookings((b ?? []) as BookingRow[]);
          } else {
            setBookings([]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const bySlot = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const bk of bookings) {
      const arr = map.get(bk.slot_id) ?? [];
      arr.push(bk);
      map.set(bk.slot_id, arr);
    }
    return map;
  }, [bookings]);

  const toggleDetails = (slotId: string) => {
    setExpanded((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
  };

  const deleteEvent = async () => {
    if (!event) return;
    if (!confirm("Supprimer cet événement ? Toutes les réservations seront supprimées.")) return;
    try {
      setBusy(true);
      const { error } = await supabase.from('events').delete().eq('id', event.id);
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setBusy(false);
    }
  };

  const duplicateEvent = async () => {
    if (!event) return;
    try {
      setBusy(true);
      // Create copy of event
      const { data: copyEvt, error: evtErr } = await supabase
        .from('events')
        .insert({
          title: `${event.title} (copie)`,
          description: event.description,
          location: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          slot_duration_minutes: event.slot_duration_minutes ?? 10,
          teacher_id: event.teacher_id,
          is_public: event.is_public ?? false,
          // teacher_id enforced by RLS to current user via with check
        })
        .select('id')
        .single();
      if (evtErr) throw evtErr;
      const newEventId = copyEvt!.id as string;

      // Copy slots from current event
      const { data: s, error: sErr } = await supabase
        .from('time_slots')
        .select('starts_at, ends_at')
        .eq('event_id', event.id)
        .order('starts_at', { ascending: true });
      if (sErr) throw sErr;
      if (s && s.length > 0) {
        const slotsToInsert = s.map((x) => ({ event_id: newEventId, starts_at: x.starts_at, ends_at: x.ends_at, capacity: 1 }));
        const { error: insErr } = await supabase.from('time_slots').insert(slotsToInsert);
        if (insErr) throw insErr;
      }

      router.push(`/dashboard/event/${newEventId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la duplication');
    } finally {
      setBusy(false);
    }
  };

  const regenerateSlots = async () => {
    if (!event) return;
    try {
      setBusy(true);
      if (windows.length > 0) {
        // Confirm once for all windows
        if (!confirm(`Supprimer les créneaux existants et régénérer pour ${windows.length} date(s) ?`)) return;
        // For each window, delete and recreate window-specific slots
        for (const win of windows) {
          const { error: delErr } = await supabase
            .from('time_slots')
            .delete()
            .eq('window_id', win.id);
          if (delErr) throw delErr;
          const gens = generateSlotsArray(win.starts_at, win.ends_at, win.slot_duration_minutes).map((s: { starts_at: string; ends_at: string }) => ({
            event_id: win.event_id,
            window_id: win.id,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            capacity: 1,
          }));
          if (gens.length > 0) {
            const { error: insErr } = await supabase.from('time_slots').insert(gens);
            if (insErr) throw insErr;
          }
        }
      } else {
        // Legacy single-window behavior using event fields
        if (!event.starts_at || !event.ends_at) {
          setError("L'événement n'a pas de plage horaire définie.");
          return;
        }
        const duration = event.slot_duration_minutes ?? 10;
        if (!confirm(`Supprimer les créneaux existants et régénérer par pas de ${duration} min ?`)) return;
        const { error: delErr } = await supabase.from('time_slots').delete().eq('event_id', event.id);
        if (delErr) throw delErr;
        const start = new Date(event.starts_at);
        const end = new Date(event.ends_at);
        const ms = duration * 60 * 1000;
        const newSlots: { event_id: string; starts_at: string; ends_at: string; capacity: number }[] = [];
        for (let cur = new Date(start); cur < end; cur = new Date(cur.getTime() + ms)) {
          const nxt = new Date(cur.getTime() + ms);
          if (nxt > end) break;
          newSlots.push({ event_id: event.id, starts_at: cur.toISOString(), ends_at: nxt.toISOString(), capacity: 1 });
        }
        if (newSlots.length > 0) {
          const { error: insErr } = await supabase.from('time_slots').insert(newSlots);
          if (insErr) throw insErr;
        }
      }

      // Refresh after regeneration
      const { data: s } = await supabase
        .from("time_slots")
        .select("id, starts_at, ends_at, window_id, capacity")
        .eq("event_id", event.id)
        .order("starts_at", { ascending: true });
      setSlots((s ?? []) as SlotRow[]);
      setBookings([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la régénération des créneaux');
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    try {
      setBusy(true);
      const { error: delErr } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);
      if (delErr) throw delErr;
      // refresh view
      const { data: s } = await supabase
        .from("time_slots")
        .select("id, starts_at, ends_at, window_id, capacity")
        .eq("event_id", eventId)
        .order("starts_at", { ascending: true });
      setSlots((s ?? []) as SlotRow[]);
      const slotIds = (s ?? []).map((x) => x.id);
      const { data: b } = await supabase
        .from("bookings")
        .select("id, slot_id, parent_email, parent_name, created_at")
        .in("slot_id", slotIds);
      setBookings((b ?? []) as BookingRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'annulation");
    } finally {
      setBusy(false);
    }
  };

  // Helpers (component scope)
  function combineDateTime(dateStr: string, timeStr: string): string | null {
    if (!dateStr || !timeStr) return null;
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const d = new Date(year, (month - 1), day, hour ?? 0, minute ?? 0, 0, 0);
    return d.toISOString();
  }

  function generateSlotsArray(startIso: string, endIso: string, durationMin: number) {
    const out: { starts_at: string; ends_at: string }[] = [];
    const start = new Date(startIso);
    const end = new Date(endIso);
    const step = durationMin * 60 * 1000;
    for (let cur = new Date(start); cur < end; cur = new Date(cur.getTime() + step)) {
      const nxt = new Date(cur.getTime() + step);
      if (nxt > end) break;
      out.push({ starts_at: cur.toISOString(), ends_at: nxt.toISOString() });
    }
    return out;
  }

  const saveEvent = async () => {
    if (!event) return;
    try {
      setBusy(true);
      const startsIso = combineDateTime(editDate, editStart);
      const endsIso = combineDateTime(editDate, editEnd);
      const payload: Partial<Omit<EventRow, 'id' | 'teacher_id'>> = {
        title: editTitle,
        description: editDescription,
        location: editLocation,
        is_public: editIsPublic,
        slot_duration_minutes: editDuration,
      };
      if (startsIso) payload.starts_at = startsIso;
      if (endsIso) payload.ends_at = endsIso;
      const { error: upErr } = await supabase
        .from('events')
        .update(payload)
        .eq('id', event.id);
      if (upErr) throw upErr;

      setEvent({ ...event, ...payload });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setBusy(false);
    }
  };

  const scheduleChanged = useMemo(() => {
    if (!event) return false;
    const toIso = (d: string, t: string) => {
      if (!d || !t) return null;
      const [Y, M, D] = d.split("-").map(Number);
      const [h, m] = t.split(":").map(Number);
      const dt = new Date(Y, (M - 1), D, h ?? 0, m ?? 0, 0, 0);
      return dt.toISOString();
    };
    const curStart = toIso(editDate, editStart);
    const curEnd = toIso(editDate, editEnd);
    const origStart = event.starts_at ?? null;
    const origEnd = event.ends_at ?? null;
    const origDur = event.slot_duration_minutes ?? 10;
    return (
      curStart !== origStart ||
      curEnd !== origEnd ||
      editDuration !== origDur
    );
  }, [event, editDate, editStart, editEnd, editDuration]);

  // Windows: create and regenerate per window
  const [newWinDate, setNewWinDate] = useState("");
  const [newWinStart, setNewWinStart] = useState("");
  const [newWinEnd, setNewWinEnd] = useState("");
  const [newWinDur, setNewWinDur] = useState<number>(10);

  const createWindow = async () => {
    if (!event) return;
    const startIso = combineDateTime(newWinDate, newWinStart);
    const endIso = combineDateTime(newWinDate, newWinEnd);
    if (!startIso || !endIso) {
      setError("Veuillez renseigner date, heure de début et de fin.");
      return;
    }
    try {
      setBusy(true);
      const { data: win, error: wErr } = await supabase
        .from('event_windows')
        .insert({
          event_id: event.id,
          starts_at: startIso,
          ends_at: endIso,
          slot_duration_minutes: newWinDur,
        })
        .select('id, starts_at, ends_at, slot_duration_minutes, event_id')
        .single();
      if (wErr) throw wErr;

      // Generate slots for this new window
      const gens = generateSlotsArray(win!.starts_at, win!.ends_at, win!.slot_duration_minutes).map((s: { starts_at: string; ends_at: string }) => ({
        event_id: event.id,
        window_id: win!.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));
      if (gens.length > 0) {
        const { error: insErr } = await supabase.from('time_slots').insert(gens);
        if (insErr) throw insErr;
      }

      // Refresh windows and slots
      const { data: w } = await supabase
        .from("event_windows")
        .select("id, event_id, starts_at, ends_at, slot_duration_minutes")
        .eq("event_id", event.id)
        .order("starts_at", { ascending: true });
      setWindows((w ?? []) as WindowRow[]);
      const { data: s } = await supabase
        .from("time_slots")
        .select("id, starts_at, ends_at")
        .eq("event_id", event.id)
        .order("starts_at", { ascending: true });
      setSlots((s ?? []) as SlotRow[]);

      // reset form
      setNewWinDate(""); setNewWinStart(""); setNewWinEnd(""); setNewWinDur(10);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'ajout de la date");
    } finally {
      setBusy(false);
    }
  };

  const regenerateWindow = async (win: WindowRow) => {
    try {
      setBusy(true);
      const { error: delErr } = await supabase
        .from('time_slots')
        .delete()
        .eq('window_id', win.id);
      if (delErr) throw delErr;
      const gens = generateSlotsArray(win.starts_at, win.ends_at, win.slot_duration_minutes).map((s: { starts_at: string; ends_at: string }) => ({
        event_id: win.event_id,
        window_id: win.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));
      if (gens.length > 0) {
        const { error: insErr } = await supabase.from('time_slots').insert(gens);
        if (insErr) throw insErr;
      }
      const { data: s } = await supabase
        .from("time_slots")
        .select("id, starts_at, ends_at, window_id, capacity")
        .eq("event_id", win.event_id)
        .order("starts_at", { ascending: true });
      setSlots((s ?? []) as SlotRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la régénération");
    } finally {
      setBusy(false);
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
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            <div className="text-xs text-gray-600">
              {event.starts_at && (
                <span>Début: {new Date(event.starts_at).toLocaleString()}</span>
              )}
              {" "}
              {event.ends_at && (
                <span>Fin: {new Date(event.ends_at).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button href="/dashboard" variant="secondary" size="sm">Retour</Button>
            <Button
              onClick={() => {
                if (!publicUrl) return;
                navigator.clipboard.writeText(publicUrl);
              }}
              variant="ghost"
              size="sm"
            >
              Copier lien public
            </Button>
            <Button disabled={busy} onClick={duplicateEvent} variant="secondary" size="sm">
              Dupliquer
            </Button>
            {windows.length === 0 && (
              <Button disabled={busy || !scheduleChanged} onClick={regenerateSlots} variant="secondary" size="sm">
                Régénérer les créneaux
              </Button>
            )}
            <Button disabled={busy} onClick={deleteEvent} variant="danger" size="sm">
              Supprimer
            </Button>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="font-medium">Créneaux</h2>
          {slots.length === 0 ? (
            <p className="text-sm text-gray-600">Aucun créneau.</p>
          ) : (
            (() => {
              // Group by window when possible, else by date
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
                      items: items.slice().sort((a,b)=> new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()),
                      startAt: (() => {
                        const w = winById.get(winId);
                        return new Date(w ? w.starts_at : items[0].starts_at).getTime();
                      })(),
                    }))
                    .sort((a,b)=> a.startAt - b.startAt)
                    .map(({ winId, items }) => {
                      const w = winById.get(winId);
                      const dateLabel = w ? new Date(w.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }) : new Date(items[0].starts_at).toLocaleDateString();
                      const startLabel = w ? new Date(w.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(items[0].starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const endLabel = w ? new Date(w.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(items[items.length-1].ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const dur = w?.slot_duration_minutes;
                      const reservedCount = items.reduce((acc, s) => acc + (bySlot.get(s.id) ? 1 : 0), 0);
                      const ratio = reservedCount / items.length;
                      const badgeClass = ratio >= 0.67
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : ratio >= 0.34
                        ? 'bg-orange-100 text-orange-700 border-orange-200'
                        : 'bg-green-100 text-green-700 border-green-200';
                      return (
                        <div key={winId} className="space-y-2">
                          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                            <span>
                              {dateLabel} — {startLabel} → {endLabel}{dur ? ` — ${dur} min` : ''}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs border rounded ${badgeClass}`}>
                              {reservedCount}/{items.length} réservés
                            </span>
                          </h3>
                          <ul className="space-y-2">
                            {items.map((s) => {
                              const bks = bySlot.get(s.id) ?? [];
                              const reservedCount = bks.length;
                              const cap = s.capacity ?? 1;
                              const remaining = Math.max(0, cap - reservedCount);
                              const isOpen = (expanded[s.id] ?? (reservedCount > 0));
                              return (
                                <li key={s.id} className="flex items-center justify-between border rounded-md p-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium">
                                      {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {" - "}
                                      {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="text-xs text-gray-700">
                                      Réservations: {reservedCount}/{cap} — Restants: {remaining}
                                    </div>
                                    {bks.length > 0 && isOpen && (
                                      <div className="mt-1 space-y-1">
                                        {bks.map((bk) => (
                                          <div key={bk.id} className="text-xs text-gray-700 flex items-center justify-between gap-2">
                                            <span className="truncate">
                                              Réservé par {bk.parent_name || "(Nom non fourni)"} &lt;{bk.parent_email}&gt; — {new Date(bk.created_at).toLocaleString()}
                                            </span>
                                            <Button disabled={busy} onClick={() => cancelBooking(bk.id)} variant="danger" size="sm">
                                              Annuler
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {reservedCount > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleDetails(s.id)}
                                      >
                                        Détails {isOpen ? '▾' : '▸'} ({reservedCount})
                                      </Button>
                                    )}
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      disabled={busy}
                                      onClick={async () => {
                                        try {
                                          setBusy(true);
                                          const { error } = await supabase
                                            .from('time_slots')
                                            .update({ capacity: cap + 1 })
                                            .eq('id', s.id);
                                          if (error) throw error;
                                          const { data: s2 } = await supabase
                                            .from('time_slots')
                                            .select('id, starts_at, ends_at, window_id, capacity')
                                            .eq('event_id', event.id)
                                            .order('starts_at', { ascending: true });
                                          setSlots((s2 ?? []) as SlotRow[]);
                                        } catch (e) {
                                          console.error(e);
                                        } finally {
                                          setBusy(false);
                                        }
                                      }}
                                    >+1 cap</Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy || cap <= reservedCount || cap <= 1}
                                      onClick={async () => {
                                        try {
                                          setBusy(true);
                                          const { error } = await supabase
                                            .from('time_slots')
                                            .update({ capacity: Math.max(1, cap - 1) })
                                            .eq('id', s.id);
                                          if (error) throw error;
                                          const { data: s2 } = await supabase
                                            .from('time_slots')
                                            .select('id, starts_at, ends_at, window_id, capacity')
                                            .eq('event_id', event.id)
                                            .order('starts_at', { ascending: true });
                                          setSlots((s2 ?? []) as SlotRow[]);
                                        } catch (e) {
                                          console.error(e);
                                        } finally {
                                          setBusy(false);
                                        }
                                      }}
                                    >-1 cap</Button>
                                  </div>
                                </li>
                              );
                            })}
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
                            items: items.slice().sort((a,b)=> new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()),
                            ts: new Date(items[0].starts_at).setHours(0,0,0,0),
                          }))
                          .sort((a,b)=> a.ts - b.ts)
                          .map(({ date, items }) => (
                            <div key={date} className="space-y-2">
                              {(() => {
                                const reservedCount = items.reduce((acc, s) => acc + (bySlot.get(s.id) ? 1 : 0), 0);
                                const ratio = reservedCount / items.length;
                                const badgeClass = ratio >= 0.67
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : ratio >= 0.34
                                  ? 'bg-orange-100 text-orange-700 border-orange-200'
                                  : 'bg-green-100 text-green-700 border-green-200';
                                return (
                                  <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <span>
                                      {new Date(items[0].starts_at).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 text-xs border rounded ${badgeClass}`}>
                                      {reservedCount}/{items.length} réservés
                                    </span>
                                  </h3>
                                );
                              })()}
                              <ul className="space-y-2">
                                {items.map((s) => {
                                  const bks = bySlot.get(s.id) ?? [];
                                  const reservedCount = bks.length;
                                  const cap = s.capacity ?? 1;
                                  const remaining = Math.max(0, cap - reservedCount);
                                  const isOpen = (expanded[s.id] ?? (reservedCount > 0));
                                  return (
                                    <li key={s.id} className="flex items-center justify-between border rounded-md p-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium">
                                          {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          {" - "}
                                          {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="text-xs text-gray-700">
                                          Réservations: {reservedCount}/{cap} — Restants: {remaining}
                                        </div>
                                        {bks.length > 0 && isOpen && (
                                          <div className="mt-1 space-y-1">
                                            {bks.map((bk) => (
                                              <div key={bk.id} className="text-xs text-gray-700 flex items-center justify-between gap-2">
                                                <span className="truncate">
                                                  Réservé par {bk.parent_name || "(Nom non fourni)"} &lt;{bk.parent_email}&gt; — {new Date(bk.created_at).toLocaleString()}
                                                </span>
                                                <Button disabled={busy} onClick={() => cancelBooking(bk.id)} variant="danger" size="sm">
                                                  Annuler
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {reservedCount > 0 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleDetails(s.id)}
                                          >
                                            Détails {isOpen ? '▾' : '▸'} ({reservedCount})
                                          </Button>
                                        )}
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          disabled={busy}
                                          onClick={async () => {
                                            try {
                                              setBusy(true);
                                              const { error } = await supabase
                                                .from('time_slots')
                                                .update({ capacity: cap + 1 })
                                                .eq('id', s.id);
                                              if (error) throw error;
                                              const { data: s2 } = await supabase
                                                .from('time_slots')
                                                .select('id, starts_at, ends_at, window_id, capacity')
                                                .eq('event_id', event.id)
                                                .order('starts_at', { ascending: true });
                                              setSlots((s2 ?? []) as SlotRow[]);
                                            } catch (e) {
                                              console.error(e);
                                            } finally {
                                              setBusy(false);
                                            }
                                          }}
                                        >+1 cap</Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={busy || cap <= reservedCount || cap <= 1}
                                          onClick={async () => {
                                            try {
                                              setBusy(true);
                                              const { error } = await supabase
                                                .from('time_slots')
                                                .update({ capacity: Math.max(1, cap - 1) })
                                                .eq('id', s.id);
                                              if (error) throw error;
                                              const { data: s2 } = await supabase
                                                .from('time_slots')
                                                .select('id, starts_at, ends_at, window_id, capacity')
                                                .eq('event_id', event.id)
                                                .order('starts_at', { ascending: true });
                                              setSlots((s2 ?? []) as SlotRow[]);
                                            } catch (e) {
                                              console.error(e);
                                            } finally {
                                              setBusy(false);
                                            }
                                          }}
                                        >-1 cap</Button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })()
          )}
        </section>

        {showHelp && (
          <div className="fixed inset-0 z-50 grid place-items-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowHelp(false)} />
            <div className="relative bg-white rounded-md shadow-lg max-w-lg w-full p-5 space-y-3">
              <h3 className="text-lg font-semibold">Fenêtres et créneaux</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <p>
                  Une <strong>fenêtre</strong> correspond à une date avec une plage horaire (début → fin) et une durée de créneau. Les
                  <strong> créneaux</strong> sont découpés automatiquement à partir de ces informations.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Ajoutez plusieurs fenêtres pour proposer différentes dates pour un même événement.</li>
                  <li>Le bouton « Régénérer » d’une fenêtre supprime ses créneaux et les recrée selon sa durée et sa plage.</li>
                  <li>Le bouton global est masqué dès qu’au moins une fenêtre existe, pour éviter des créneaux sans fenêtre.</li>
                  <li>Les réservations existantes sur des créneaux supprimés sont également supprimées (cascade).</li>
                </ul>
                <p>
                  Côté page publique, les créneaux sont <strong>regroupés par fenêtre</strong> et affichent un sous‑titre avec la date, l’intervalle
                  complet et la durée (ex: « Mer 02/10 — 17:00 → 20:00 — 15 min »).
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowHelp(false)}>Fermer</Button>
              </div>
            </div>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="font-medium">Dates (fenêtres) de l’événement</h2>
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-xs text-gray-500">
              La régénération des créneaux se fait désormais fenêtre par fenêtre. Le bouton global est masqué lorsqu’au moins une fenêtre existe.
            </p>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowHelp(true)}>En savoir plus</Button>
            </div>
            {windows.length === 0 ? (
              <p className="text-sm text-gray-600">Aucune date ajoutée pour cet événement.</p>) : (
              <ul className="space-y-2">
                {windows.map((w) => (
                  <li key={w.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {new Date(w.starts_at).toLocaleDateString()} — {new Date(w.starts_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} → {new Date(w.ends_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                      </div>
                      <div className="text-xs text-gray-600">Durée des créneaux: {w.slot_duration_minutes} min</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => regenerateWindow(w)}>Régénérer</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t pt-3 space-y-3">
              <h3 className="font-medium text-sm">Ajouter une date</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date</label>
                  <Input type="date" value={newWinDate} onChange={(e)=>setNewWinDate(e.target.value)} className="w-[15rem]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Début</label>
                  <Input type="time" value={newWinStart} onChange={(e)=>setNewWinStart(e.target.value)} className="w-[9rem]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fin</label>
                  <Input type="time" value={newWinEnd} onChange={(e)=>setNewWinEnd(e.target.value)} className="w-[9rem]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Durée (min)</label>
                  <Input type="number" min={5} step={5} value={newWinDur} onChange={(e)=>setNewWinDur(Number(e.target.value))} className="w-[7rem]" />
                </div>
                <Button onClick={createWindow} disabled={busy}>Ajouter</Button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Éditer l’événement</h2>
          <div className="rounded-md border p-4 space-y-4">
            <Field label="Titre">
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                rows={3}
                value={editDescription ?? ''}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </Field>
            <Field label="Lieu">
              <Input value={editLocation ?? ''} onChange={(e) => setEditLocation(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label="Date">
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-[15rem]" />
              </Field>
              <Field label="Début">
                <Input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="w-[9rem]" />
              </Field>
              <Field label="Fin">
                <Input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="w-[9rem]" />
              </Field>
              <Field label="Durée (min)">
                <Input type="number" min={5} step={5} value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} className="w-[7rem]" />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input id="pub" type="checkbox" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} />
              <label htmlFor="pub" className="text-sm">Lien public (les parents peuvent réserver sans compte)</label>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveEvent} disabled={busy}>Enregistrer</Button>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!event) return;
                // reset edits from current event
                setEditTitle(event.title);
                setEditDescription(event.description);
                setEditLocation(event.location);
                setEditIsPublic(Boolean(event.is_public));
                if (event.starts_at) {
                  const d = new Date(event.starts_at);
                  setEditDate(d.toISOString().slice(0,10));
                  setEditStart(d.toTimeString().slice(0,5));
                }
                if (event.ends_at) {
                  const e = new Date(event.ends_at);
                  setEditEnd(e.toTimeString().slice(0,5));
                }
                setEditDuration(event.slot_duration_minutes ?? 10);
              }}>Réinitialiser</Button>
            </div>
            <p className="text-xs text-gray-500">Modifier la fenêtre horaire ne met pas automatiquement à jour les créneaux existants. Utilisez « Régénérer les créneaux » pour recréer les créneaux selon la nouvelle durée et plage.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
