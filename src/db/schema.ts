import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  customType,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";

/**
 * Alle beløb gemmes i øre (heltal) for at undgå afrundingsfejl.
 * Datoer uden klokkeslæt gemmes som 'YYYY-MM-DD'-strenge.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" });
const companyRef = () =>
  text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" });

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

// ---------------------------------------------------------------------------
// Brugere, virksomheder og roller
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  // Til refusion af udlæg
  bankReg: text("bank_reg"),
  bankAccount: text("bank_account"),
  totpSecret: text("totp_secret"),
  lastCompanyId: text("last_company_id"),
  createdAt: createdAt(),
});

export type CompanySettings = {
  paymentLeadDays?: number; // hvor mange dage før forfald betalingen afsendes
  fourEyesThreshold?: number; // øre – betalinger over beløbet kræver 2 personer
  autoApproveBelow?: number; // øre – fakturaer fra kendte leverandører under beløbet auto-godkendes
  reminderHours?: number;
  defaultPaymentAccountId?: string;
  propertyModule?: boolean;
  onboardingDone?: boolean;
  seedComplete?: boolean; // sættes på demovirksomheden, når demodata er skrevet i én transaktion
};

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  cvr: text("cvr"),
  address: text("address"),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<CompanySettings>().notNull().default({}),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const ROLES = ["owner", "admin", "accountant", "approver", "member", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: companyRef(),
    role: text("role").$type<Role>().notNull().default("member"),
    title: text("title"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const invitations = pgTable("invitations", {
  id: id(),
  companyId: companyRef(),
  email: text("email").notNull(),
  role: text("role").$type<Role>().notNull(),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const delegations = pgTable("delegations", {
  id: id(),
  companyId: companyRef(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delegateId: text("delegate_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Filer
// ---------------------------------------------------------------------------

export const files = pgTable("files", {
  id: id(),
  companyId: companyRef(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Bogføringsstamdata (synkroniseres fra regnskabsprogram)
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    companyId: companyRef(),
    number: text("number").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("expense"), // expense | balance | revenue
    defaultVatCode: text("default_vat_code"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("accounts_company_number").on(t.companyId, t.number)],
);

export const vatCodes = pgTable(
  "vat_codes",
  {
    id: id(),
    companyId: companyRef(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    rate: real("rate").notNull(), // 0.25 = 25 %
  },
  (t) => [uniqueIndex("vat_company_code").on(t.companyId, t.code)],
);

export const departments = pgTable("departments", {
  id: id(),
  companyId: companyRef(),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

// ---------------------------------------------------------------------------
// Ejendomsmodul (Boligflow)
// ---------------------------------------------------------------------------

export const properties = pgTable("properties", {
  id: id(),
  companyId: companyRef(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  address: text("address"),
  zip: text("zip"),
  city: text("city"),
  annualBudget: money("annual_budget"),
  departmentCode: text("department_code"),
  createdAt: createdAt(),
});

export const units = pgTable("units", {
  id: id(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  tenantName: text("tenant_name"),
  areaM2: real("area_m2"),
});

// ---------------------------------------------------------------------------
// Leverandører
// ---------------------------------------------------------------------------

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    companyId: companyRef(),
    name: text("name").notNull(),
    cvr: text("cvr"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    industry: text("industry"),
    // Betalingsoplysninger
    bankReg: text("bank_reg"),
    bankAccount: text("bank_account"),
    iban: text("iban"),
    bic: text("bic"),
    fiCreditor: text("fi_creditor"),
    bankVerifiedAt: timestamp("bank_verified_at", { withTimezone: true }),
    bankChangedAt: timestamp("bank_changed_at", { withTimezone: true }),
    // Standardkontering
    defaultAccount: text("default_account"),
    defaultVatCode: text("default_vat_code"),
    defaultDepartment: text("default_department"),
    defaultPropertyId: text("default_property_id"),
    paymentTermsDays: integer("payment_terms_days"),
    trusted: boolean("trusted").notNull().default(false),
    externalId: text("external_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_company_cvr").on(t.companyId, t.cvr)],
);

// ---------------------------------------------------------------------------
// Fakturaer / bilag
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  "processing", // AI aflæser
  "review", // kræver gennemsyn/kontering
  "pending_approval",
  "approved", // godkendt, afventer betaling
  "scheduled", // i betalingsbatch
  "paid",
  "rejected",
  "archived", // bogført uden betaling (fx betalingsservice/kort)
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceFlag = {
  code:
    | "duplicate"
    | "bank_changed"
    | "new_supplier"
    | "price_jump"
    | "vat_mismatch"
    | "sum_mismatch"
    | "overdue"
    | "missing_payment_info"
    | "low_confidence"
    | "unusual_amount"
    | "foreign_iban"
    | "discount_available";
  severity: "info" | "warning" | "critical";
  message: string;
  dismissed?: boolean;
};

export type FieldConfidence = Partial<Record<string, number>>;

export type ExtractionResult = {
  provider: "claude" | "demo" | "ubl";
  model?: string;
  confidence: FieldConfidence;
  rawText?: string;
  summary?: string;
  durationMs?: number;
};

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    companyId: companyRef(),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
    source: text("source").notNull().default("upload"), // upload | email | nemhandel | mobile | boligflow | demo
    sourceRef: text("source_ref"),
    kind: text("kind").notNull().default("invoice"), // invoice | credit_note | expense
    status: text("status").$type<InvoiceStatus>().notNull().default("processing"),
    supplierName: text("supplier_name"),
    supplierCvr: text("supplier_cvr"),
    invoiceNumber: text("invoice_number"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    currency: text("currency").notNull().default("DKK"),
    amountExVat: money("amount_ex_vat"),
    vatAmount: money("vat_amount"),
    totalAmount: money("total_amount"),
    // Betaling
    paymentMethod: text("payment_method"), // fik | domestic | iban | betalingsservice | card | none
    fikType: text("fik_type"), // 71 | 73 | 75 | 01 | 04 | 15
    fikCreditor: text("fik_creditor"),
    fikPaymentId: text("fik_payment_id"),
    bankReg: text("bank_reg"),
    bankAccount: text("bank_account"),
    iban: text("iban"),
    bic: text("bic"),
    paymentMessage: text("payment_message"),
    discountDate: date("discount_date"),
    discountAmount: money("discount_amount"),
    // Kontering (header-niveau; linjer kan overstyre)
    description: text("description"),
    propertyId: text("property_id").references(() => properties.id, { onDelete: "set null" }),
    unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
    departmentCode: text("department_code"),
    // AI
    extraction: jsonb("extraction").$type<ExtractionResult>(),
    flags: jsonb("flags").$type<InvoiceFlag[]>().notNull().default([]),
    duplicateOfId: text("duplicate_of_id"),
    // Udlæg
    expenseUserId: text("expense_user_id").references(() => users.id, { onDelete: "set null" }),
    // Bogføring
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    externalVoucher: text("external_voucher"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    submittedBy: text("submitted_by").references(() => users.id, { onDelete: "set null" }),
    rejectedReason: text("rejected_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invoices_company_status").on(t.companyId, t.status),
    index("invoices_company_due").on(t.companyId, t.dueDate),
    index("invoices_supplier").on(t.supplierId),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(1),
  unitPrice: money("unit_price"),
  amount: money("amount").notNull().default(0), // ekskl. moms
  vatCode: text("vat_code"),
  accountNumber: text("account_number"),
  departmentCode: text("department_code"),
  propertyId: text("property_id").references(() => properties.id, { onDelete: "set null" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  aiSuggested: boolean("ai_suggested").notNull().default(false),
  aiConfidence: real("ai_confidence"),
  aiReason: text("ai_reason"),
});

export const comments = pgTable("comments", {
  id: id(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Konteringsregler (manuelle + lærte)
// ---------------------------------------------------------------------------

export const codingRules = pgTable("coding_rules", {
  id: id(),
  companyId: companyRef(),
  name: text("name").notNull(),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }),
  matchText: text("match_text"), // matcher linjebeskrivelse (case-insensitive)
  accountNumber: text("account_number"),
  vatCode: text("vat_code"),
  departmentCode: text("department_code"),
  propertyId: text("property_id").references(() => properties.id, { onDelete: "set null" }),
  source: text("source").notNull().default("manual"), // manual | learned
  hits: integer("hits").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Godkendelse
// ---------------------------------------------------------------------------

export type WorkflowConditions = {
  minAmount?: number | null; // øre
  maxAmount?: number | null;
  supplierIds?: string[];
  propertyIds?: string[];
  departmentCodes?: string[];
  newSupplierOnly?: boolean;
  kinds?: string[];
};

export type WorkflowStep = {
  name: string;
  approverIds: string[]; // specifikke brugere
  role?: string | null; // eller alle med rollen
  mode: "any" | "all";
};

export const approvalWorkflows = pgTable("approval_workflows", {
  id: id(),
  companyId: companyRef(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(100),
  conditions: jsonb("conditions").$type<WorkflowConditions>().notNull().default({}),
  steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id"),
    stepIndex: integer("step_index").notNull(),
    stepName: text("step_name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("any"),
    status: text("status").notNull().default("waiting"), // waiting | pending | approved | rejected | skipped
    comment: text("comment"),
    delegatedFrom: text("delegated_from"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_user_status").on(t.userId, t.status), index("approvals_invoice").on(t.invoiceId)],
);

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

export const bankConnections = pgTable("bank_connections", {
  id: id(),
  companyId: companyRef(),
  provider: text("provider").notNull(), // sandbox | enablebanking
  bankId: text("bank_id").notNull(),
  bankName: text("bank_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | expired | error
  externalId: text("external_id"),
  state: text("state"),
  consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  companyId: companyRef(),
  connectionId: text("connection_id").references(() => bankConnections.id, { onDelete: "set null" }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  bankName: text("bank_name"),
  reg: text("reg"),
  account: text("account"),
  iban: text("iban"),
  bic: text("bic"),
  currency: text("currency").notNull().default("DKK"),
  balance: money("balance"),
  balanceAt: timestamp("balance_at", { withTimezone: true }),
  ledgerAccount: text("ledger_account"), // bogføringskonto for banken
  createdAt: createdAt(),
});

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: id(),
    companyId: companyRef(),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    bookingDate: date("booking_date").notNull(),
    amount: money("amount").notNull(), // negativ = udgående
    currency: text("currency").notNull().default("DKK"),
    text: text("text").notNull(),
    counterparty: text("counterparty"),
    reference: text("reference"),
    status: text("status").notNull().default("unmatched"), // unmatched | matched | ignored
    matchedInvoiceId: text("matched_invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    matchedPaymentId: text("matched_payment_id"),
    matchConfidence: real("match_confidence"),
    createdAt: createdAt(),
  },
  (t) => [
    index("banktx_company_status").on(t.companyId, t.status),
    uniqueIndex("banktx_account_external").on(t.bankAccountId, t.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Betalinger
// ---------------------------------------------------------------------------

export const paymentBatches = pgTable("payment_batches", {
  id: id(),
  companyId: companyRef(),
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  // draft | awaiting_second_approval | awaiting_signature | submitted | completed | partially_failed | failed | cancelled | exported
  method: text("method").notNull().default("api"), // api | file
  totalAmount: money("total_amount").notNull().default(0),
  count: integer("count").notNull().default(0),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  secondApproverId: text("second_approver_id").references(() => users.id, { onDelete: "set null" }),
  signedBy: text("signed_by").references(() => users.id, { onDelete: "set null" }),
  externalId: text("external_id"),
  scaUrl: text("sca_url"),
  fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    companyId: companyRef(),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    batchId: text("batch_id").references(() => paymentBatches.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("DKK"),
    executionDate: date("execution_date").notNull(),
    status: text("status").notNull().default("planned"),
    // planned | in_batch | submitted | executed | failed | cancelled
    creditorName: text("creditor_name").notNull(),
    method: text("method").notNull(), // fik | domestic | iban
    fikType: text("fik_type"),
    fikCreditor: text("fik_creditor"),
    fikPaymentId: text("fik_payment_id"),
    bankReg: text("bank_reg"),
    bankAccount: text("bank_account"),
    iban: text("iban"),
    bic: text("bic"),
    message: text("message"),
    ownReference: text("own_reference"),
    externalId: text("external_id"),
    error: text("error"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("payments_company_status").on(t.companyId, t.status)],
);

// ---------------------------------------------------------------------------
// Integrationer, notifikationer, revisionsspor
// ---------------------------------------------------------------------------

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    companyId: companyRef(),
    provider: text("provider").notNull(), // economic | boligflow | nemhandel | ai | email
    mode: text("mode").notNull().default("sandbox"), // sandbox | live
    status: text("status").notNull().default("connected"), // connected | disconnected | error
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integrations_company_provider").on(t.companyId, t.provider)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    companyId: companyRef(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user").on(t.userId, t.readAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    companyId: companyRef(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_company_created").on(t.companyId, t.createdAt), index("audit_entity").on(t.entityId)],
);

export const outbox = pgTable("outbox_emails", {
  id: id(),
  companyId: text("company_id"),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull().default("queued"), // queued | sent | logged | failed
  error: text("error"),
  createdAt: createdAt(),
});
