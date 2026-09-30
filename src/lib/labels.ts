import type { InvoiceStatus } from "@/db/schema";

export const STATUS: Record<InvoiceStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }> = {
  processing: { label: "Aflæses", tone: "info" },
  review: { label: "Til gennemsyn", tone: "warning" },
  pending_approval: { label: "Afventer godkendelse", tone: "info" },
  approved: { label: "Godkendt", tone: "brand" },
  scheduled: { label: "Sat til betaling", tone: "brand" },
  paid: { label: "Betalt", tone: "success" },
  rejected: { label: "Afvist", tone: "danger" },
  archived: { label: "Bogført", tone: "neutral" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }> = {
  planned: { label: "Planlagt", tone: "neutral" },
  in_batch: { label: "I batch", tone: "info" },
  submitted: { label: "Sendt til bank", tone: "brand" },
  executed: { label: "Gennemført", tone: "success" },
  failed: { label: "Fejlet", tone: "danger" },
  cancelled: { label: "Annulleret", tone: "neutral" },
};

export const BATCH_STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }> = {
  draft: { label: "Kladde", tone: "neutral" },
  awaiting_second_approval: { label: "Afventer 2. godkender", tone: "warning" },
  awaiting_signature: { label: "Klar til underskrift", tone: "info" },
  submitted: { label: "Sendt til bank", tone: "brand" },
  exported: { label: "Fil eksporteret", tone: "brand" },
  completed: { label: "Gennemført", tone: "success" },
  partially_failed: { label: "Delvist fejlet", tone: "danger" },
  failed: { label: "Fejlet", tone: "danger" },
  cancelled: { label: "Annulleret", tone: "neutral" },
};

export const SOURCE_LABEL: Record<string, string> = {
  upload: "Upload",
  email: "E-mail",
  nemhandel: "NemHandel",
  mobile: "Mobil",
  boligflow: "Boligflow",
  demo: "Demo",
};

export const METHOD_LABEL: Record<string, string> = {
  fik: "FI-kort",
  domestic: "Bankoverførsel",
  iban: "IBAN / udland",
  betalingsservice: "Betalingsservice",
  card: "Betalt med kort",
  none: "Ingen betaling",
  expense: "Refusion til medarbejder",
};

export const KIND_LABEL: Record<string, string> = {
  invoice: "Faktura",
  credit_note: "Kreditnota",
  expense: "Udlæg",
};

export const AUDIT_LABEL: Record<string, string> = {
  received: "modtog",
  submitted: "sendte til godkendelse",
  auto_submitted: "sendte automatisk til godkendelse",
  auto_approved: "godkendte automatisk",
  approved_step: "godkendte",
  approved: "endeligt godkendt",
  rejected: "afviste",
  edited: "redigerede",
  reprocessed: "genlæste",
  booked: "bogførte",
  booking_failed: "kunne ikke bogføre",
  paid: "registrerede betaling af",
  marked_paid: "markerede som betalt",
  payment_booked: "bogførte betaling af",
  flag_dismissed: "godkendte en advarsel på",
  deleted: "slettede",
  created: "oprettede",
  second_approved: "2.-godkendte",
  sign_started: "startede underskrift af",
  signed: "underskrev",
  sign_cancelled: "annullerede underskrift af",
  exported: "eksporterede",
  cancelled: "annullerede",
  rescheduled: "flyttede",
  connected: "forbandt",
  started: "startede",
};
