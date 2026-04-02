import { prisma } from './prisma.js';
import { ensureDefaultPipelineStages } from './pipelineDefaults.js';
import { normalizePhoneDigits } from './phoneNormalize.js';

export type CsvImportParams = {
  workspaceId: string;
  rows: Record<string, string>[];
  columnMap: Record<string, string>;
};

const CHUNK = 250;

function getCol(row: Record<string, string>, columnMap: Record<string, string>, key: string): string {
  const header = columnMap[key];
  if (!header) return '';
  return (row[header] ?? '').trim();
}

function addrKey(address: string, zip: string): string {
  return `${address.toLowerCase().trim()}|${zip.replace(/\s/g, '').toLowerCase()}`;
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
  const { workspaceId, rows, columnMap } = p;

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

  for (const row of rows) {
    const address = getCol(row, columnMap, 'address');
    const zip = getCol(row, columnMap, 'zip');
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
    const phoneNorm = phoneRaw ? normalizePhoneDigits(phoneRaw) : null;
    if (phoneNorm && seenPhone.has(phoneNorm)) {
      duplicates += 1;
      continue;
    }

    seenAddr.add(ak);
    if (phoneNorm) seenPhone.add(phoneNorm);

    const city = getCol(row, columnMap, 'city') || 'Unknown';
    const state = getCol(row, columnMap, 'state') || 'XX';
    const firstNameRaw = getCol(row, columnMap, 'firstName');
    let firstName: string | null = firstNameRaw || null;
    let lastName: string | null = null;
    if (firstNameRaw && firstNameRaw.includes(' ')) {
      const parts = firstNameRaw.split(/\s+/);
      firstName = parts[0] ?? null;
      lastName = parts.slice(1).join(' ') || null;
    }

    const phoneDisplay = phoneRaw || null;
    pending.push({
      address,
      city,
      state,
      zip,
      contact:
        phoneDisplay || firstName || lastName
          ? { firstName, lastName, phone: phoneDisplay }
          : undefined,
    });
  }

  let imported = 0;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((item) =>
        prisma.lead.create({
          data: {
            workspaceId,
            address: item.address,
            city: item.city,
            state: item.state,
            zip: item.zip,
            status: 'NEW',
            source: 'csv_upload',
            stageId: defaultStage?.id ?? undefined,
            ...(item.contact
              ? {
                  contacts: {
                    create: [
                      {
                        workspaceId,
                        firstName: item.contact.firstName,
                        lastName: item.contact.lastName,
                        phone: item.contact.phone,
                      },
                    ],
                  },
                }
              : {}),
          },
        })
      )
    );
    imported += slice.length;
  }

  return { imported, duplicates, skippedInvalid };
}
