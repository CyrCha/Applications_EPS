"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";
import { CopyButton } from "@/components/CopyButton";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { Input } from "@/components/Input";
import { Field } from "@/components/Field";
import {
  combineDateTime,
  formatDateTime,
  formatTime,
  toLocalDateInput,
  toLocalTimeInput,
} from "@/lib/datetime";
import {
  generateSlots,
  groupSlots,
  MIN_SLOT_DURATION_MINUTES,
  validateSchedule,
  type EventWindow,
  type Slot,
} from "@/lib/slots";
import { exportEventToPdf } from "./exportPdf";
import { SlotGroupSection, type Booking } from "./SlotGroupSection";

const SLOT_COLUMNS = "id, starts_at, ends_at, window_id, capacity";
const BOOKING_COLUMNS = "id, slot_id, parent_email, parent_name, created_at";
const WINDOW_COLUMNS = "id, event_id, starts_at, ends_at, slot_duration_minutes";

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

export default function ManageEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const router = useRouter();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [windows, setWindows] = useState<EventWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<string | null>(null);
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editDuration, setEditDuration] = useState(10);
  const [showHelp, setShowHelp] = useState(false);

  const [newWinDate, setNewWinDate] = useState("");
  const [newWinStart, setNewWinStart] = useState("");
  const [newWinEnd, setNewWinEnd] = useState("");
  const [newWinDur, setNewWinDur] = useState(10);

  const publicUrl = useMemo(() => {
    if (!eventId || typeof window === "undefined") return "";
    return `${window.location.origin}/p/${eventId}`;
  }, [eventId]);

  const resetEditForm = useCallback((ev: EventRow) => {
    setEditTitle(ev.title);
    setEditDescription(ev.description);
    setEditLocation(ev.location);
    setEditIsPublic(Boolean(ev.is_public));
    setEditDate(ev.starts_at ? toLocalDateInput(ev.starts_at) : "");
    setEditStart(ev.starts_at ? toLocalTimeInput(ev.starts_at) : "");
    setEditEnd(ev.ends_at ? toLocalTimeInput(ev.ends_at) : "");
    setEditDuration(ev.slot_duration_minutes ?? 10);
  }, []);

  const fetchSlots = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("time_slots")
      .select(SLOT_COLUMNS)
      .eq("event_id", id)
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Slot[];
  }, []);

  const fetchBookings = useCallback(async (slotIds: string[]) => {
    if (slotIds.length === 0) return [];
    const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).in("slot_id", slotIds);
    if (error) throw error;
    return (data ?? []) as Booking[];
  }, []);

  const fetchWindows = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("event_windows")
      .select(WINDOW_COLUMNS)
      .eq("event_id", id)
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as EventWindow[];
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
          router.replace("/auth");
          return;
        }

        const { data: evt, error: evtErr } = await supabase
          .from("events")
          .select(
            "id, title, description, location, starts_at, ends_at, slot_duration_minutes, teacher_id, is_public"
          )
          .eq("id", eventId)
          .single();
        if (evtErr) throw evtErr;

        const [slotRows, windowRows] = await Promise.all([fetchSlots(eventId), fetchWindows(eventId)]);
        const bookingRows = await fetchBookings(slotRows.map((s) => s.id));

        if (!mounted) return;
        setEvent(evt as EventRow);
        setSlots(slotRows);
        setWindows(windowRows);
        setBookings(bookingRows);
        resetEditForm(evt as EventRow);
      } catch (err: unknown) {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [eventId, router, fetchSlots, fetchWindows, fetchBookings, resetEditForm]);

  // Realtime: only refresh when a booking of this event changes, and coalesce bursts.
  const slotIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    slotIdsRef.current = new Set(slots.map((s) => s.id));
  }, [slots]);

  useEffect(() => {
    if (!eventId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const rows = await fetchBookings([...slotIdsRef.current]);
        setBookings(rows);
      } catch {
        // transient refresh failure: the next event will retry
      }
    };

    const channel = supabase
      .channel(`bookings-event-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        const changed = [payload.new, payload.old] as Array<{ slot_id?: string } | null>;
        if (!changed.some((row) => row?.slot_id && slotIdsRef.current.has(row.slot_id))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, 250);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [eventId, fetchBookings]);

  const bookingsBySlot = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of bookings) {
      const arr = map.get(booking.slot_id);
      if (arr) arr.push(booking);
      else map.set(booking.slot_id, [booking]);
    }
    return map;
  }, [bookings]);

  const groups = useMemo(() => groupSlots(slots, windows), [slots, windows]);

  const runAction = useCallback(async (action: () => Promise<void>, fallbackMessage: string) => {
    try {
      setBusy(true);
      setActionError(null);
      await action();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }, []);

  const exportToPdf = () =>
    event && runAction(() => exportEventToPdf(event, groups, bookingsBySlot), "Erreur lors de l'export PDF");

  const deleteEvent = () => {
    if (!event) return;
    if (!confirm("Supprimer cet événement ? Toutes les réservations seront supprimées.")) return;
    runAction(async () => {
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;
      router.push("/dashboard");
    }, "Erreur lors de la suppression");
  };

  const duplicateEvent = () => {
    if (!event) return;
    runAction(async () => {
      const { data: copyEvt, error: evtErr } = await supabase
        .from("events")
        .insert({
          title: `${event.title} (copie)`,
          description: event.description,
          location: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          slot_duration_minutes: event.slot_duration_minutes ?? 10,
          teacher_id: event.teacher_id,
          is_public: event.is_public ?? false,
        })
        .select("id")
        .single();
      if (evtErr) throw evtErr;
      const newEventId = copyEvt.id as string;

      // Copy windows one by one so each copy is mapped to its source, even when
      // two windows share the same start.
      const windowIdMap = new Map<string, string>();
      for (const w of windows) {
        const { data: created, error: winErr } = await supabase
          .from("event_windows")
          .insert({
            event_id: newEventId,
            starts_at: w.starts_at,
            ends_at: w.ends_at,
            slot_duration_minutes: w.slot_duration_minutes,
          })
          .select("id")
          .single();
        if (winErr) throw winErr;
        windowIdMap.set(w.id, created.id as string);
      }

      if (slots.length > 0) {
        const { error: insErr } = await supabase.from("time_slots").insert(
          slots.map((s) => ({
            event_id: newEventId,
            window_id: s.window_id ? windowIdMap.get(s.window_id) ?? null : null,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            capacity: Math.max(1, s.capacity ?? 1),
          }))
        );
        if (insErr) throw insErr;
      }

      router.push(`/dashboard/event/${newEventId}`);
    }, "Erreur lors de la duplication");
  };

  const regenerateSlots = () => {
    if (!event) return;
    const { starts_at: startsAt, ends_at: endsAt } = event;
    if (!startsAt || !endsAt) {
      setActionError("L'événement n'a pas de plage horaire définie.");
      return;
    }
    const duration = event.slot_duration_minutes ?? 10;
    const invalid = validateSchedule(startsAt, endsAt, duration);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    if (!confirm(`Supprimer les créneaux existants et régénérer par pas de ${duration} min ?`)) return;

    runAction(async () => {
      const { error: delErr } = await supabase.from("time_slots").delete().eq("event_id", event.id);
      if (delErr) throw delErr;
      const generated = generateSlots(startsAt, endsAt, duration).map((s) => ({
        event_id: event.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));
      if (generated.length > 0) {
        const { error: insErr } = await supabase.from("time_slots").insert(generated);
        if (insErr) throw insErr;
      }
      setSlots(await fetchSlots(event.id));
      setBookings([]);
    }, "Erreur lors de la régénération des créneaux");
  };

  const cancelBooking = (bookingId: string) => {
    if (!confirm("Annuler cette réservation ?")) return;
    runAction(async () => {
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    }, "Erreur lors de l'annulation");
  };

  const changeCapacity = (slotId: string, capacity: number) =>
    runAction(async () => {
      const next = Math.max(1, capacity);
      const { error } = await supabase.from("time_slots").update({ capacity: next }).eq("id", slotId);
      if (error) throw error;
      setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, capacity: next } : s)));
    }, "Erreur lors de la mise à jour de la capacité");

  const saveEvent = () => {
    if (!event) return;
    const startsIso = combineDateTime(editDate, editStart);
    const endsIso = combineDateTime(editDate, editEnd);
    if (startsIso && endsIso) {
      const invalid = validateSchedule(startsIso, endsIso, editDuration);
      if (invalid) {
        setActionError(invalid);
        return;
      }
    }
    runAction(async () => {
      const payload: Partial<EventRow> = {
        title: editTitle,
        description: editDescription,
        location: editLocation,
        is_public: editIsPublic,
        slot_duration_minutes: editDuration,
      };
      if (startsIso) payload.starts_at = startsIso;
      if (endsIso) payload.ends_at = endsIso;
      const { error } = await supabase.from("events").update(payload).eq("id", event.id);
      if (error) throw error;
      setEvent({ ...event, ...payload });
    }, "Erreur lors de l'enregistrement");
  };

  const createWindow = () => {
    if (!event) return;
    const startIso = combineDateTime(newWinDate, newWinStart);
    const endIso = combineDateTime(newWinDate, newWinEnd);
    const invalid = validateSchedule(startIso, endIso, newWinDur);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    runAction(async () => {
      const { data: win, error: wErr } = await supabase
        .from("event_windows")
        .insert({
          event_id: event.id,
          starts_at: startIso,
          ends_at: endIso,
          slot_duration_minutes: newWinDur,
        })
        .select(WINDOW_COLUMNS)
        .single();
      if (wErr) throw wErr;

      const created = win as EventWindow;
      const generated = generateSlots(created.starts_at, created.ends_at, created.slot_duration_minutes).map((s) => ({
        event_id: event.id,
        window_id: created.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));
      if (generated.length > 0) {
        const { error: insErr } = await supabase.from("time_slots").insert(generated);
        if (insErr) throw insErr;
      }

      const [windowRows, slotRows] = await Promise.all([fetchWindows(event.id), fetchSlots(event.id)]);
      setWindows(windowRows);
      setSlots(slotRows);
      setNewWinDate("");
      setNewWinStart("");
      setNewWinEnd("");
      setNewWinDur(10);
    }, "Erreur lors de l'ajout de la date");
  };

  const regenerateWindow = (win: EventWindow) => {
    if (!event) return;
    if (!confirm("Régénérer les créneaux de cette date ? Les réservations existantes seront supprimées.")) return;
    runAction(async () => {
      const { error: delErr } = await supabase.from("time_slots").delete().eq("window_id", win.id);
      if (delErr) throw delErr;
      const generated = generateSlots(win.starts_at, win.ends_at, win.slot_duration_minutes).map((s) => ({
        event_id: event.id,
        window_id: win.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));
      if (generated.length > 0) {
        const { error: insErr } = await supabase.from("time_slots").insert(generated);
        if (insErr) throw insErr;
      }
      const slotRows = await fetchSlots(event.id);
      setSlots(slotRows);
      setBookings(await fetchBookings(slotRows.map((s) => s.id)));
    }, "Erreur lors de la régénération");
  };

  const deleteWindow = (win: EventWindow) => {
    if (!event) return;
    if (!confirm("Supprimer cette date ainsi que ses créneaux et réservations ?")) return;
    runAction(async () => {
      const { error: slotErr } = await supabase.from("time_slots").delete().eq("window_id", win.id);
      if (slotErr) throw slotErr;
      const { error: winErr } = await supabase.from("event_windows").delete().eq("id", win.id);
      if (winErr) throw winErr;
      const [windowRows, slotRows] = await Promise.all([fetchWindows(event.id), fetchSlots(event.id)]);
      setWindows(windowRows);
      setSlots(slotRows);
      setBookings(await fetchBookings(slotRows.map((s) => s.id)));
    }, "Erreur lors de la suppression de la date");
  };

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;
  if (!event) return <ErrorState message="Événement introuvable." />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <div className="text-xs text-gray-600">
            {event.starts_at && <span>Début: {formatDateTime(event.starts_at)}</span>}{" "}
            {event.ends_at && <span>Fin: {formatDateTime(event.ends_at)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href="/dashboard" variant="secondary" size="sm">
            Retour
          </Button>
          <CopyButton value={publicUrl} label="Copier lien public" variant="ghost" />
          <Button disabled={busy} onClick={duplicateEvent} variant="secondary" size="sm">
            Dupliquer
          </Button>
          {windows.length === 0 && (
            <Button disabled={busy} onClick={regenerateSlots} variant="secondary" size="sm">
              Régénérer les créneaux
            </Button>
          )}
          <Button disabled={busy || slots.length === 0} onClick={exportToPdf} variant="secondary" size="sm">
            Exporter en PDF
          </Button>
          <Button disabled={busy} onClick={deleteEvent} variant="danger" size="sm">
            Supprimer
          </Button>
        </div>
      </header>

      {actionError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Créneaux</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun créneau.</p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <SlotGroupSection
                key={group.key}
                group={group}
                bookingsBySlot={bookingsBySlot}
                busy={busy}
                onCancelBooking={cancelBooking}
                onCapacityChange={changeCapacity}
              />
            ))}
          </div>
        )}
      </section>

      {showHelp && (
        <div className="fixed inset-0 z-50 grid place-items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHelp(false)} />
          <div className="relative bg-white rounded-md shadow-lg max-w-lg w-full p-5 space-y-3">
            <h3 className="text-lg font-semibold">Fenêtres et créneaux</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>
                Une <strong>fenêtre</strong> correspond à une date avec une plage horaire (début → fin) et une durée de
                créneau. Les <strong>créneaux</strong> sont découpés automatiquement à partir de ces informations.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ajoutez plusieurs fenêtres pour proposer différentes dates pour un même événement.</li>
                <li>Le bouton « Régénérer » d’une fenêtre supprime ses créneaux et les recrée selon sa durée et sa plage.</li>
                <li>Le bouton global est masqué dès qu’au moins une fenêtre existe, pour éviter des créneaux sans fenêtre.</li>
                <li>Les réservations existantes sur des créneaux supprimés sont également supprimées (cascade).</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowHelp(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Dates (fenêtres) de l’événement</h2>
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-xs text-gray-500">
            La régénération des créneaux se fait fenêtre par fenêtre. Le bouton global est masqué lorsqu’au moins une
            fenêtre existe.
          </p>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowHelp(true)}>
              En savoir plus
            </Button>
          </div>
          {windows.length === 0 ? (
            <p className="text-sm text-gray-600">Aucune date ajoutée pour cet événement.</p>
          ) : (
            <ul className="space-y-2">
              {windows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {formatDateTime(w.starts_at)} → {formatTime(w.ends_at)}
                    </div>
                    <div className="text-xs text-gray-600">Durée des créneaux: {w.slot_duration_minutes} min</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => regenerateWindow(w)}>
                      Régénérer
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => deleteWindow(w)}>
                      Supprimer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-3 space-y-3">
            <h3 className="font-medium text-sm">Ajouter une date</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <Field label="Date" htmlFor="win-date">
                <Input
                  id="win-date"
                  type="date"
                  value={newWinDate}
                  onChange={(e) => setNewWinDate(e.target.value)}
                  className="w-[15rem]"
                />
              </Field>
              <Field label="Début" htmlFor="win-start">
                <Input
                  id="win-start"
                  type="time"
                  value={newWinStart}
                  onChange={(e) => setNewWinStart(e.target.value)}
                  className="w-[9rem]"
                />
              </Field>
              <Field label="Fin" htmlFor="win-end">
                <Input
                  id="win-end"
                  type="time"
                  value={newWinEnd}
                  onChange={(e) => setNewWinEnd(e.target.value)}
                  className="w-[9rem]"
                />
              </Field>
              <Field label="Durée (min)" htmlFor="win-duration">
                <Input
                  id="win-duration"
                  type="number"
                  min={MIN_SLOT_DURATION_MINUTES}
                  step={5}
                  value={newWinDur}
                  onChange={(e) => setNewWinDur(Number(e.target.value))}
                  className="w-[7rem]"
                />
              </Field>
              <Button onClick={createWindow} disabled={busy}>
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Éditer l’événement</h2>
        <div className="rounded-md border p-4 space-y-4">
          <Field label="Titre" htmlFor="edit-title">
            <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <textarea
              id="edit-description"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              rows={3}
              value={editDescription ?? ""}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </Field>
          <Field label="Lieu" htmlFor="edit-location">
            <Input id="edit-location" value={editLocation ?? ""} onChange={(e) => setEditLocation(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="Date" htmlFor="edit-date">
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-[15rem]"
              />
            </Field>
            <Field label="Début" htmlFor="edit-start">
              <Input
                id="edit-start"
                type="time"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className="w-[9rem]"
              />
            </Field>
            <Field label="Fin" htmlFor="edit-end">
              <Input
                id="edit-end"
                type="time"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className="w-[9rem]"
              />
            </Field>
            <Field label="Durée (min)" htmlFor="edit-duration">
              <Input
                id="edit-duration"
                type="number"
                min={MIN_SLOT_DURATION_MINUTES}
                step={5}
                value={editDuration}
                onChange={(e) => setEditDuration(Number(e.target.value))}
                className="w-[7rem]"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <input id="pub" type="checkbox" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} />
            <label htmlFor="pub" className="text-sm">
              Lien public (les parents peuvent réserver sans compte)
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEvent} disabled={busy}>
              Enregistrer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => resetEditForm(event)}>
              Réinitialiser
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Modifier la fenêtre horaire ne met pas automatiquement à jour les créneaux existants. Utilisez « Régénérer
            les créneaux » pour recréer les créneaux selon la nouvelle durée et plage.
          </p>
        </div>
      </section>
    </div>
  );
}
