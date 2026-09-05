"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { formatDateTime, formatRange } from "@/lib/datetime";
import type { Slot, SlotGroup } from "@/lib/slots";
import { remainingSeats } from "@/lib/slots";

export type Booking = {
  id: string;
  slot_id: string;
  parent_email: string;
  parent_name: string | null;
  created_at: string;
};

type Props = {
  group: SlotGroup<Slot>;
  bookingsBySlot: Map<string, Booking[]>;
  busy: boolean;
  onCancelBooking: (bookingId: string) => void;
  onCapacityChange: (slotId: string, capacity: number) => void;
};

function fillBadgeClass(ratio: number) {
  if (ratio >= 0.67) return "bg-red-100 text-red-700 border-red-200";
  if (ratio >= 0.34) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-green-100 text-green-700 border-green-200";
}

export function SlotGroupSection({ group, bookingsBySlot, busy, onCancelBooking, onCapacityChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const seats = group.items.reduce((acc, s) => acc + Math.max(1, s.capacity ?? 1), 0);
  const booked = group.items.reduce((acc, s) => acc + (bookingsBySlot.get(s.id)?.length ?? 0), 0);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <span>{group.label}</span>
        <span className={`inline-flex items-center px-2 py-0.5 text-xs border rounded ${fillBadgeClass(seats ? booked / seats : 0)}`}>
          {booked}/{seats} réservés
        </span>
      </h3>
      <ul className="space-y-2">
        {group.items.map((slot) => {
          const slotBookings = bookingsBySlot.get(slot.id) ?? [];
          const capacity = Math.max(1, slot.capacity ?? 1);
          const remaining = remainingSeats(capacity, slotBookings.length);
          const isOpen = expanded[slot.id] ?? slotBookings.length > 0;
          return (
            <li key={slot.id} className="flex items-center justify-between gap-2 border rounded-md p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{formatRange(slot.starts_at, slot.ends_at)}</div>
                <div className="text-xs text-gray-700">
                  Réservations: {slotBookings.length}/{capacity} — Restants: {remaining}
                </div>
                {slotBookings.length > 0 && isOpen && (
                  <div className="mt-1 space-y-1">
                    {slotBookings.map((booking) => (
                      <div key={booking.id} className="text-xs text-gray-700 flex items-center justify-between gap-2">
                        <span className="truncate">
                          Réservé par {booking.parent_name || "(Nom non fourni)"} &lt;{booking.parent_email}&gt; —{" "}
                          {formatDateTime(booking.created_at)}
                        </span>
                        <Button disabled={busy} onClick={() => onCancelBooking(booking.id)} variant="danger" size="sm">
                          Annuler
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {slotBookings.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded((prev) => ({ ...prev, [slot.id]: !isOpen }))}
                  >
                    Détails {isOpen ? "▾" : "▸"} ({slotBookings.length})
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-label="Augmenter la capacité"
                  onClick={() => onCapacityChange(slot.id, capacity + 1)}
                >
                  +1 cap
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || capacity <= slotBookings.length || capacity <= 1}
                  aria-label="Diminuer la capacité"
                  onClick={() => onCapacityChange(slot.id, capacity - 1)}
                >
                  -1 cap
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
