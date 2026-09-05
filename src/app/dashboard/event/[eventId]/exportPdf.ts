import { formatDateTime, formatRange } from "@/lib/datetime";
import type { Slot, SlotGroup } from "@/lib/slots";
import { remainingSeats } from "@/lib/slots";
import type { Booking } from "./SlotGroupSection";

type ExportEvent = {
  title: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

const MARGIN = 40;

/** jsPDF core fonts use WinAnsi, which has no arrow glyph. */
const pdfText = (value: string) => value.replace(/[→–]/g, "-");

/**
 * jsPDF and its autotable plugin weigh several hundred kB, so they are only
 * fetched when a teacher actually exports.
 */
export async function exportEventToPdf(
  event: ExportEvent,
  groups: SlotGroup<Slot>[],
  bookingsBySlot: Map<string, Booking[]>
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  doc.setFontSize(16);
  doc.text(event.title || "Événement", MARGIN, y);
  y += 18;
  doc.setFontSize(10);
  for (const line of [
    event.location ? `Lieu: ${event.location}` : null,
    event.starts_at ? `Début: ${formatDateTime(event.starts_at)}` : null,
    event.ends_at ? `Fin: ${formatDateTime(event.ends_at)}` : null,
  ]) {
    if (!line) continue;
    doc.text(line, MARGIN, y);
    y += 14;
  }

  for (const group of groups) {
    y += 22;
    if (y > pageHeight - 120) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(12);
    doc.text(pdfText(group.label), MARGIN, y);

    const body = group.items.map((slot) => {
      const slotBookings = bookingsBySlot.get(slot.id) ?? [];
      const capacity = Math.max(1, slot.capacity ?? 1);
      return [
        pdfText(formatRange(slot.starts_at, slot.ends_at)),
        slotBookings.map((b) => `${b.parent_name ?? ""} <${b.parent_email}>`).join("\n") || "—",
        String(capacity),
        String(remainingSeats(capacity, slotBookings.length)),
      ];
    });

    autoTable(doc, {
      startY: y + 8,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Créneau", "Réservations", "Capacité", "Restants"]],
      body,
      styles: { fontSize: 9, cellPadding: 4, valign: "top" },
      headStyles: { fillColor: [66, 133, 244], textColor: 255 },
    });
    y = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(pdfText(`Exporté le ${formatDateTime(new Date())} - Page ${i}/${pages}`), MARGIN, pageHeight - 20);
  }

  doc.save(`${(event.title || "export").replace(/\s+/g, "-")}.pdf`);
}
