"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Field } from "@/components/Field";
import { combineDateTime } from "@/lib/datetime";
import { generateSlots, MIN_SLOT_DURATION_MINUTES, validateSchedule } from "@/lib/slots";

export default function NewEventPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Vous devez être connecté.");

      const startIso = combineDateTime(date, startTime);
      const endIso = combineDateTime(date, endTime);
      const invalid = validateSchedule(startIso, endIso, duration);
      if (invalid || !startIso || !endIso) throw new Error(invalid ?? "Date/horaires invalides.");

      // Create event
      const { data: eventInsert, error: eventErr } = await supabase
        .from("events")
        .insert({
          teacher_id: userId,
          title,
          description,
          location,
          is_public: isPublic,
          starts_at: startIso,
          ends_at: endIso,
          slot_duration_minutes: duration,
        })
        .select("id")
        .single();

      if (eventErr) throw eventErr;
      const eventId = eventInsert.id as string;

      // Generate and insert time slots
      const slots = generateSlots(startIso, endIso, duration).map((s) => ({
        event_id: eventId,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        capacity: 1,
      }));

      if (slots.length > 0) {
        const { error: slotsErr } = await supabase.from("time_slots").insert(slots);
        if (slotsErr) throw slotsErr;
      }

      router.push(`/dashboard/event/${eventId}`);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Erreur lors de la création de l'événement");
    } finally {
      setLoading(false);
    }
  };

  const slotPreview = (() => {
    const startIso = combineDateTime(date, startTime);
    const endIso = combineDateTime(date, endTime);
    if (!startIso || !endIso || validateSchedule(startIso, endIso, duration)) return null;
    return generateSlots(startIso, endIso, duration).length;
  })();

  return (
    <div>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Créer un événement</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Titre">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Réunion Parents–Professeurs"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Bâtiment A, salle 204"
              rows={3}
            />
          </Field>

          <Field label="Lieu">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Collège Jean Moulin, Salle 12"
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field label="Date">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-[15rem]"
              />
            </Field>
            <Field label="Début">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-[9rem]"
              />
            </Field>
            <Field label="Fin">
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-[9rem]"
              />
            </Field>
            <Field label="Durée (min)">
              <Input
                type="number"
                min={MIN_SLOT_DURATION_MINUTES}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
                className="w-[7rem]"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isPublic"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <label htmlFor="isPublic" className="text-sm">
              Lien public (les parents peuvent réserver sans compte)
            </label>
          </div>

          {slotPreview !== null && (
            <p className="text-xs text-gray-600">{slotPreview} créneau(x) seront générés.</p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/dashboard")}>Annuler</Button>
          </div>

          {error && (
            <p className="text-red-600 text-sm" role="alert">{error}</p>
          )}
        </form>
        <p className="text-xs text-gray-500 mt-6">
          Remarque: les heures sont interprétées dans votre fuseau local, puis stockées en UTC.
        </p>
      </div>
    </div>
  );
}
