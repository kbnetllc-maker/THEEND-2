import { prisma } from './prisma.js';
import { cleanAddressLine, cleanState, cleanZip } from './addressNormalize.js';
import { ensureDefaultPipelineStages } from './pipelineDefaults.js';
import { normalizePhoneDigits, toE164US } from './phoneNormalize.js';
import { queueEnrichmentJobsForLeads } from './queueEnrichmentBatch.js';
import { PlanLimitExceededError } from './planErrors.js';
import { assertLeadsWithinPlan } from './usageLimits.js';

export type CsvImportParams = {
  workspaceId: string;
  rows: Record<string, string>[];
  columnMap: Record<string, string>;
  /** Server-only: super-admin bypass for plan lead caps */
  skipUsageLimits?: boolean;
};

const CHUNK = 250;

function getCol(row: Record<string, string>, columnMap: Record<string, string>, key: string): string {
  const header = columnMap[key];
  if (!header) return '';
  return (row[header] ?? '').trim();
}

function normalizeStreet(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addrKey(address: string, zip: string): string {
  return `${normalizeStreet(address)}|${zip.replace(/\s/g, '').toLowerCase()}`;
}

export type CsvImportResult = {
  imported: number;
  duplicates: number;
  skippedInvalid: number;
};

type PendingRow = {
  address: string;
  city: string;
  state: string;
  zip: string;
  contact?: { firstName?: string | null; lastName?: string | null; phone?: string | null };
};

export async function importCsvIntoWorkspace(p: CsvImportParams): Promise<CsvImportResult> {
  const { workspaceId, rows, columnMap, skipUsageLimits } = p;

  if (!skipUsageLimits) {
    const cap = await assertLeadsWithinPlan(workspaceId, rows.length);
    if (!cap.ok) {
      throw new PlanLimitExceededError();
    }
  }

  await ensureDefaultPipelineStages(workspaceId);

  const existingLeads = await prisma.lead.findMany({
    where: { workspaceId, isArchived: false },
    select: { address: true, zip: true },
  });
  const seenAddr = new Set(existingLeads.map((l) => addrKey(l.address, l.zip)));

  const existingPhones = await prisma.contact.findMany({
    where: { workspaceId, phone: { not: null } },
    select: { phone: true },
  });
  const seenPhone = new Set<string>();
  for (const c of existingPhones) {
    const n = c.phone ? normalizePhoneDigits(c.phone) : null;
    if (n) seenPhone.add(n);
  }

  const pending: PendingRow[] = [];
  let duplicates = 0;
  let skippedInvalid = 0;

  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { workspaceId },
    orderBy: { order: 'asc' },
    select: { id: true },
  });

  const phoneHeaderMapped = Boolean(columnMap.phone);

  for (const row of rows) {
    const addressRaw = getCol(row, columnMap, 'address');
    const zipRaw = getCol(row, columnMap, 'zip');
    if (!addressRaw || !zipRaw) {
      skippedInvalid += 1;
      continue;
    }

    const address = cleanAddressLine(addressRaw);
    const zip = cleanZip(zipRaw);
    const city = cleanAddressLine(getCol(row, columnMap, 'city')) || 'Unknown';
    const state = cleanState(getCol(row, columnMap, 'state') || 'XX');

    if (!address || !zip) {
      skippedInvalid += 1;
      continue;
    }

    const ak = addrKey(address, zip);
    if (seenAddr.has(ak)) {
      duplicates += 1;
      continue;
    }

    const phoneRaw = getCol(row, columnMap, 'phone');
    if (phoneHeaderMapped && phoneRaw && !toE164US(phoneRaw)) {
      skippedInvalid += 1;
      continue;
    }
    const phoneNorm = phoneRaw ? normalizePhoneDigits(phoneRaw) : null;
    if (phoneNorm && seenPhone.has(phoneNorm)) {
      duplicates += 1;
      continue;
    }

    seenAddr.add(ak);
    if (phoneNorm) seenPhone.add(phoneNorm);

    const firstNameRaw = getCol(row, columnMap, 'firstName');
    let firstName: string | null = firstNameRaw ? cleanAddressLine(firstNameRaw) : null;
    let lastName: string | null = null;
    if (firstNameRaw && firstNameRaw.includes(' ')) {
      const parts = firstNameRaw.split(/\s+/);
      firstName = parts[0] ? cleanAddressLine(parts[0]!) : null;
      lastName = parts.slice(1).join(' ') ? cleanAddressLine(parts.slice(1).join(' ')) : null;
    }

    const phoneE164 = phoneRaw ? toE164US(phoneRaw) : null;
    pending.push({
      address,
      city,
      state,
      zip,
      contact:
        phoneE164 || firstName || lastName
          ? { firstName, lastName, phone: phoneE164 }
          : undefined,
    });
  }

  const importedLeadIds: string[] = [];

  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    const leadData = slice.map((item) => ({
      workspaceId,
      address: item.address,
      city: item.city,
      state: item.state,
      zip: item.zip,
      status: 'NEW' as const,
      source: 'csv_upload',
      stageId: defaultStage?.id ?? null,
    }));

    const created = await prisma.lead.createManyAndReturn({
      data: leadData,
    });

    const contactRows: {
      workspaceId: string;
      leadId: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    }[] = [];

    for (let j = 0; j < created.length; j++) {
      const lead = created[j]!;
      const item = slice[j]!;
      importedLeadIds.push(lead.id);
      if (item.contact?.firstName || item.contact?.lastName || item.contact?.phone) {
        contactRows.push({
          workspaceId,
          leadId: lead.id,
          firstName: item.contact.firstName ?? null,
          lastName: item.contact.lastName ?? null,
          phone: item.contact.phone ?? null,
        });
      }
    }

    if (contactRows.length > 0) {
      await prisma.contact.createMany({ data: contactRows });
    }
  }

  if (importedLeadIds.length > 0) {
    try {
      await queueEnrichmentJobsForLeads(importedLeadIds, workspaceId);
    } catch {
      // queueEnrichmentJobsForLeads logs; import still succeeded
    }
  }

  return { imported: importedLeadIds.length, duplicates, skippedInvalid };
}
