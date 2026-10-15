"use strict";

const { Hook, PluginManager } = require("../../../server/utils/PluginManager");
const { Document } = require("../../../server/models");
const Logger = require("../../../server/logging/Logger").default;
const fetch = require("../../../server/utils/fetch").default;
const env = require("../../../server/env").default;

const PAGE_LIMIT = 100;
const MAX_PAGES = 10000;
const INDEXING_TIMEOUT_MS = 10 * 60 * 1000;
const INDEXING_POLL_MS = 2000;
const SYNC_EVENTS = [
  "documents.create",
  "documents.publish",
  "documents.unpublish",
  "documents.delete",
  "documents.permanent_delete",
  "documents.archive",
  "documents.unarchive",
  "documents.restore",
  "documents.move",
  "documents.update",
  "documents.update.delayed",
  "documents.update.debounced",
  "documents.title_change",
  "collections.delete",
];

let metadataFieldsPromise;
const documentLocks = new Map();

function config() {
  const api = String(process.env.DIFY_API || "").replace(/\/+$/, "");
  const datasetId = String(process.env.DIFY_DATASET_ID || "").trim();
  const apiKey = String(process.env.DIFY_DATASET_API_KEY || "").trim();

  if (!api || !datasetId || !apiKey) {
    return null;
  }

  return { api, datasetId, apiKey };
}

function enabled() {
  const value = process.env.DIFY_SYNC_ENABLED;
  return value === undefined || value === "" || value === "1" || value === "true";
}

function authHeaders(apiKey, json) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request(settings, path, options = {}) {
  const response = await fetch(`${settings.api}${path}`, {
    ...options,
    headers: {
      ...authHeaders(settings.apiKey, options.body !== undefined),
      ...(options.headers || {}),
    },
    timeout: options.timeout || 60 * 1000,
  });
  const body = await response.text();
  let data = null;

  if (body) {
    try {
      data = JSON.parse(body);
    } catch (_err) {
      data = body;
    }
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Dify request ${response.status}: ${detail.slice(0, 1000)}`);
  }

  return data || {};
}

async function listDifyDocuments(settings) {
  const documents = [];
  const seenPages = new Set();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (seenPages.has(page)) {
      throw new Error(`Dify document pagination repeated page ${page}`);
    }
    seenPages.add(page);

    const result = await request(
      settings,
      `/datasets/${encodeURIComponent(settings.datasetId)}/documents?page=${page}&limit=${PAGE_LIMIT}`
    );
    const batch = Array.isArray(result.data) ? result.data : [];
    documents.push(...batch);

    if (!result.has_more || batch.length === 0) {
      return documents;
    }
  }

  throw new Error(`Dify document pagination exceeded ${MAX_PAGES} pages`);
}

async function ensureMetadataFields(settings) {
  if (metadataFieldsPromise) {
    return metadataFieldsPromise;
  }

  metadataFieldsPromise = (async () => {
    const result = await request(
      settings,
      `/datasets/${encodeURIComponent(settings.datasetId)}/metadata`
    );
    const fields = {};
    for (const field of result.doc_metadata || []) {
      if (field.name && field.id) {
        fields[field.name] = field.id;
      }
    }

    for (const name of [
      "outline_document_id",
      "outline_collection_id",
      "outline_url",
    ]) {
      if (fields[name]) {
        continue;
      }

      const created = await request(
        settings,
        `/datasets/${encodeURIComponent(settings.datasetId)}/metadata`,
        {
          method: "POST",
          body: JSON.stringify({ name, type: "string" }),
        }
      );
      if (!created.id) {
        throw new Error(`Dify metadata field ${name} returned no id`);
      }
      fields[name] = created.id;
    }

    return fields;
  })().catch((error) => {
    metadataFieldsPromise = undefined;
    throw error;
  });

  return metadataFieldsPromise;
}

function metadataValue(document, name) {
  const item = (document.doc_metadata || []).find((field) => field.name === name);
  return item && item.value !== undefined && item.value !== null
    ? String(item.value)
    : "";
}

async function findDifyDocuments(settings, documentId, collectionId) {
  const documents = await listDifyDocuments(settings);
  return documents.filter((document) => {
    const matchesDocument =
      documentId && metadataValue(document, "outline_document_id") === documentId;
    const matchesCollection =
      collectionId && metadataValue(document, "outline_collection_id") === collectionId;
    return matchesDocument || matchesCollection;
  });
}

async function updateMetadata(settings, fields, difyDocumentId, document) {
  await request(
    settings,
    `/datasets/${encodeURIComponent(settings.datasetId)}/documents/metadata`,
    {
      method: "POST",
      body: JSON.stringify({
        operation_data: [
          {
            document_id: difyDocumentId,
            partial_update: true,
            metadata_list: [
              {
                id: fields.outline_document_id,
                name: "outline_document_id",
                value: document.id,
              },
              {
                id: fields.outline_collection_id,
                name: "outline_collection_id",
                value: document.collectionId || "",
              },
              {
                id: fields.outline_url,
                name: "outline_url",
                value: `${String(env.URL || "").replace(/\/+$/, "")}${document.url || ""}`,
              },
            ],
          },
        ],
      }),
    }
  );
}

async function waitForIndexing(settings, batch) {
  if (!batch) {
    return;
  }

  const deadline = Date.now() + INDEXING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await request(
      settings,
      `/datasets/${encodeURIComponent(settings.datasetId)}/documents/${encodeURIComponent(batch)}/indexing-status`
    );
    const statuses = Array.isArray(result.data) ? result.data : [];

    if (statuses.some((item) => item.indexing_status === "error")) {
      throw new Error(`Dify indexing failed: ${JSON.stringify(statuses)}`);
    }
    if (statuses.length > 0 && statuses.every((item) => item.indexing_status === "completed")) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, INDEXING_POLL_MS));
  }

  throw new Error("Dify indexing timed out");
}

async function deleteDifyDocument(settings, documentId) {
  try {
    await request(
      settings,
      `/datasets/${encodeURIComponent(settings.datasetId)}/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    if (!String(error.message || "").includes("Dify request 404")) {
      throw error;
    }
  }
}

async function syncDocument(settings, outlineDocumentId) {
  const document = await Document.unscoped().findByPk(outlineDocumentId, {
    paranoid: false,
  });
  const fields = await ensureMetadataFields(settings);
  const matches = await findDifyDocuments(settings, outlineDocumentId);

  if (
    !document ||
    document.deletedAt ||
    document.archivedAt ||
    !document.publishedAt ||
    !document.collectionId ||
    document.template
  ) {
    await Promise.all(matches.map((item) => deleteDifyDocument(settings, item.id)));
    return;
  }

  const text = String(document.text || "").trim();
  if (!text) {
    await Promise.all(matches.map((item) => deleteDifyDocument(settings, item.id)));
    return;
  }

  const existing = matches.find(
    (item) => metadataValue(item, "outline_document_id") === outlineDocumentId
  );
  const payload = {
    name: document.title || outlineDocumentId,
    text,
    doc_form: "text_model",
    doc_language: "Chinese",
    process_rule: { mode: "automatic" },
  };
  const result = existing
    ? await request(
        settings,
        `/datasets/${encodeURIComponent(settings.datasetId)}/documents/${encodeURIComponent(existing.id)}/update-by-text`,
        { method: "POST", body: JSON.stringify(payload) }
      )
    : await request(
        settings,
        `/datasets/${encodeURIComponent(settings.datasetId)}/document/create-by-text`,
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            indexing_technique: "high_quality",
          }),
        }
      );
  const difyDocumentId = existing ? existing.id : result.document && result.document.id;

  if (!difyDocumentId) {
    throw new Error("Dify create/update returned no document id");
  }

  await waitForIndexing(settings, result.batch);
  await updateMetadata(settings, fields, difyDocumentId, document);
}

async function syncCollectionDelete(settings, collectionId) {
  const fields = await ensureMetadataFields(settings);
  void fields;
  const matches = await findDifyDocuments(settings, "", collectionId);
  await Promise.all(matches.map((item) => deleteDifyDocument(settings, item.id)));
}

function schedulePerDocument(documentId, operation) {
  const previous = documentLocks.get(documentId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      if (documentLocks.get(documentId) === next) {
        documentLocks.delete(documentId);
      }
    });
  documentLocks.set(documentId, next);
  return next;
}

class DifySyncProcessor {
  static applicableEvents = SYNC_EVENTS;

  async perform(event) {
    const settings = config();
    if (!settings || !enabled()) {
      return;
    }

    try {
      if (event.name === "collections.delete") {
        await syncCollectionDelete(settings, event.collectionId);
        return;
      }

      if (!event.documentId) {
        return;
      }

      await schedulePerDocument(event.documentId, () =>
        syncDocument(settings, event.documentId)
      );
    } catch (error) {
      Logger.error(`Dify sync failed for ${event.name}`, error, { event });
      throw error;
    }
  }
}

PluginManager.add({
  name: "Dify document synchronization",
  type: Hook.Processor,
  value: DifySyncProcessor,
});
