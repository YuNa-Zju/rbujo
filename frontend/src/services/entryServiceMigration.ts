const normalizeEntrySummary = (summary: any) => {
  if (!summary || typeof summary !== "object") return undefined;
  const meta = summary.meta || {};
  return {
    text: typeof summary.text === "string" ? summary.text : "",
    uploadReferences: Array.isArray(summary.upload_references)
      ? summary.upload_references
      : Array.isArray(summary.uploadReferences)
        ? summary.uploadReferences
        : [],
    meta: {
      hasImage: Boolean(meta.has_image ?? meta.hasImage),
      hasLink: Boolean(meta.has_link ?? meta.hasLink),
      hasChecklist: Boolean(meta.has_checklist ?? meta.hasChecklist),
      hasOrderedList: Boolean(meta.has_ordered_list ?? meta.hasOrderedList),
      hasUnorderedList: Boolean(
        meta.has_unordered_list ?? meta.hasUnorderedList,
      ),
      hasCode: Boolean(meta.has_code ?? meta.hasCode),
      hasMath: Boolean(meta.has_math ?? meta.hasMath),
      hasQuote: Boolean(meta.has_quote ?? meta.hasQuote),
      hasTag: Boolean(meta.has_tag ?? meta.hasTag),
    },
  };
};

export const normalizeMigrationEntry = (entry: any) => {
  if (!entry) return entry;
  return {
    ...entry,
    date: entry.date ?? entry.target_date ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    summary: normalizeEntrySummary(entry.summary),
  };
};

export const normalizeMoveToFutureResult = (result: any) => {
  const updatedSource = normalizeMigrationEntry(result?.updated_source);
  const createdEntry = normalizeMigrationEntry(result?.created_entry);
  return {
    success: true,
    updated_source: updatedSource,
    created_entry: createdEntry,
    new_entry: createdEntry,
  };
};
