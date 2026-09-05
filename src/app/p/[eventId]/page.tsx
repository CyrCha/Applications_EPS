"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";
import { CopyButton } from "@/components/CopyButton";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { Input } from "@/components/Input";
import { Field } from "@/components/Field";
import { formatDateTime, formatRange } from "@/lib/datetime";
import { downloadIcs } from "@/lib/ics";
import { groupSlots, remainingSeats, type EventWindow, type Slot } from "@/lib/slots";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_public: boolean;
};

type Availability = {
  capacity: Record<string, number>;
  booked: Record<string, number>;
};

const EMPTY_AVAILABILITY: Availability = { capacity: {}, booked: {} };

async function fetchAvailability(slotIds: string[]): Promise<Availability> {
  if (slotIds.length === 0) return EMPTY_AVAILABILITY;
  try {
    const [{ data: slotRows }, { data: bookingRows }] = await Promise.all([
      supabase.from("time_slots").select("id, capacity").in("id", slotIds),
      supabase.from("bookings").select("slot_id").in("slot_id", slotIds),
    ]);
    const capacity: Record<string, number> = {};
    for (const row of slotRows ?? []) capacity[row.id as string] = Math.max(1, Number(row.capacity ?? 1));
    const booked: Record<string, number> = {};
    for (const row of bookingRows ?? []) {
      const key = row.slot_id as string;
      booked[key] = (booked[key] ?? 0) + 1;
    }
    return { capacity, booked };
  } catch {
    // RLS may deny these reads: the page still works, without the remaining hint.
    return EMPTY_AVAILABILITY;
  }
}

export default function PublicBookingPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [windows, setWindows] = useState<EventWindow[]>([]);
  const [availability, setAvailability] = useState<Availability>(EMPTY_AVAILABILITY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [slotId, setSlotId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const eventUrl = useMemo(() => {
    if (!eventId || typeof window === "undefined") return "";
    return `${window.location.origin}/p/${eventId}`;
  }, [eventId]);

  const refreshSlots = useCallback(async () => {
    const { data, error } = await supabase.rpc("available_slots", { p_event_id: eventId });
    if (error) throw error;
    const rows = (data ?? []) as Slot[];
    setSlots(rows);
    setAvailability(await fetchAvailability(rows.map((s) => s.id)));
    return rows;
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const [{ data: evt, error: evtErr }, { data: windowRows, error: winErr }] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, location, starts_at, ends_at, is_public")
            .eq("id", eventId)
            .single(),
          supabase
            .from("event_windows")
            .select("id, starts_at, ends_at, slot_duration_minutes")
            .eq("event_id", eventId)
            .order("starts_at", { ascending: true }),
        ]);
        if (evtErr) throw evtErr;
        if (winErr) throw winErr;
        if (!(evt as EventRow).is_public) throw new Error("Cet événement n'est pas public.");

        await refreshSlots();
        if (!mounted) return;
        setEvent(evt as EventRow);
        setWindows((windowRows ?? []) as EventWindow[]);
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
  }, [eventId, refreshSlots]);

  // Realtime: keep the remaining seats in sync while parents are choosing.
  const slotIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    slotIdsRef.current = new Set(slots.map((s) => s.id));
  }, [slots]);

  useEffect(() => {
    if (!eventId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`public-bookings-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        const changed = [payload.new, payload.old] as Array<{ slot_id?: string } | null>;
        if (!changed.some((row) => row?.slot_id && slotIdsRef.current.has(row.slot_id))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          refreshSlots().catch(() => {
            // keep the currently displayed availability on transient errors
          });
        }, 400);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [eventId, refreshSlots]);

  const groups = useMemo(() => groupSlots(slots, windows), [slots, windows]);

  const seatsLeft = useCallback(
    (slot: Slot) => {
      const capacity = availability.capacity[slot.id];
      if (!capacity) return null;
      return remainingSeats(capacity, availability.booked[slot.id] ?? 0);
    },
    [availability]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      if (!slotId) throw new Error("Veuillez choisir un créneau.");
      if (!parentName.trim()) throw new Error("Veuillez saisir votre nom.");
      if (!parentEmail.trim()) throw new Error("Veuillez saisir un e-mail.");

      const chosenSlot = slots.find((s) => s.id === slotId);

      const { error: insertErr } = await supabase.rpc("create_booking", {
        p_slot_id: slotId,
        p_parent_email: parentEmail.trim(),
        p_parent_name: parentName.trim(),
      });
      if (insertErr) {
        if (insertErr.message?.toLowerCase().includes("already booked") || insertErr.code === "23505") {
          throw new Error("Ce créneau vient d'être réservé. Merci d'en choisir un autre.");
        }
        throw insertErr;
      }

      setSuccess("Réservation confirmée ! Vous pouvez ajouter ce rendez-vous à votre calendrier.");
      setSlotId("");
      await refreshSlots();

      if (chosenSlot && event) {
        downloadIcs(`rdv-${chosenSlot.id}.ics`, {
          uid: `${chosenSlot.id}@parent-teacher-meetings`,
          start: chosenSlot.starts_at,
          end: chosenSlot.ends_at,
          summary: event.title || "RDV Parent–Professeur",
          location: event.location,
          description: event.description,
        });
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur lors de la réservation");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;
  if (!event) return <ErrorState message="Événement introuvable." />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        {event.description && <p className="text-gray-700 text-sm">{event.description}</p>}
        <div className="text-xs text-gray-500">
          {event.location && <div>Lieu: {event.location}</div>}
          {event.starts_at && <div>Début: {formatDateTime(event.starts_at)}</div>}
          {event.ends_at && <div>Fin: {formatDateTime(event.ends_at)}</div>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="truncate">Lien: {eventUrl}</span>
          <CopyButton value={eventUrl} className="ml-auto" />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-medium">Choisir un créneau</h2>
        {groups.length === 0 ? (
          <div className="text-sm text-gray-700 border rounded-md p-3 bg-gray-50">
            <p className="mb-2">Tous les créneaux sont réservés ou indisponibles pour le moment.</p>
            <div className="flex gap-2">
              <CopyButton value={eventUrl} label="Copier le lien de l'événement" />
              <Button variant="ghost" size="sm" onClick={() => refreshSlots()}>
                Actualiser
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">{group.label}</h3>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {group.items.map((slot) => {
                    const remaining = seatsLeft(slot);
                    const full = remaining === 0;
                    return (
                      <li key={slot.id}>
                        <label
                          className={`flex items-center gap-2 border rounded-md p-2 ${
                            full ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-blue-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="slot"
                            value={slot.id}
                            disabled={full}
                            checked={slotId === slot.id}
                            onChange={(e) => setSlotId(e.target.value)}
                          />
                          <span>
                            {formatRange(slot.starts_at, slot.ends_at)}
                            {remaining !== null && (full ? " — complet" : ` — restants: ${remaining}`)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Vos informations</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Field className="flex-1 min-w-[12rem]" label="Nom" htmlFor="parent-name">
              <Input
                id="parent-name"
                autoComplete="name"
                placeholder="Nom du parent"
                required
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
              />
            </Field>
            <Field className="flex-1 min-w-[12rem]" label="Email" htmlFor="parent-email">
              <Input
                id="parent-email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email du parent"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" disabled={submitting || !slotId}>
            {submitting ? "Réservation..." : "Réserver"}
          </Button>
          {success && (
            <p className="text-green-600 text-sm" role="status">
              {success}
            </p>
          )}
          {formError && (
            <p className="text-red-600 text-sm" role="alert">
              {formError}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
