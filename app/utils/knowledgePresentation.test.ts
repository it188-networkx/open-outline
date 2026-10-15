const documents = new Map<
  string,
  { id: string; isArchived: boolean; isDeleted: boolean; isTemplate: boolean }
>();
const policies = new Map<
  string,
  { flattenedAbilities: Record<string, boolean> }
>();
const stores = { documents, policies };
import { getKnowledgePresentation } from "./knowledgePresentation";

const slug = "example-abcdefghij";
const path = `/doc/${slug}`;
const id = "4d607bb4-cd5f-48cb-a527-537e5c94ebc8";

beforeEach(() => {
  stores.documents.clear();
  stores.policies.clear();
});

function addDocument(abilities: Record<string, boolean>, attributes = {}) {
  const document = {
    id,
    isArchived: false,
    isDeleted: false,
    isTemplate: false,
    ...attributes,
  };
  documents.set(slug, document);
  policies.set(id, { flattenedAbilities: abilities });
  return document;
}

test.each(["/search", "/search/", "/search/oracle"])(
  "hides navigation on %s without loading a document",
  (pathname) => {
    expect(getKnowledgePresentation(pathname, stores)).toEqual({
      hideSidebar: true,
      hideArticleChrome: false,
      pending: false,
    });
  }
);

test.each([
  "/home",
  "/searching",
  "/doc/new",
  `${path}/edit`,
  `${path}/history`,
  `${path}/insights`,
  `/s/share${path}`,
  `/settings/templates/${slug}`,
])("preserves other pages: %s", (pathname) => {
  expect(getKnowledgePresentation(pathname, stores)).toEqual({
    hideSidebar: false,
    hideArticleChrome: false,
    pending: false,
  });
});

test("hides chrome while the current document or its policy is missing", () => {
  expect(getKnowledgePresentation(path, stores).pending).toBe(true);
  documents.set(slug, {
    id,
    isArchived: false,
    isDeleted: false,
    isTemplate: false,
  });
  expect(getKnowledgePresentation(path, stores)).toEqual({
    hideSidebar: true,
    hideArticleChrome: true,
    pending: true,
  });
});

test("uses effective document permissions, including membership grants", () => {
  addDocument({ read: true, update: false });
  expect(getKnowledgePresentation(path, stores).hideArticleChrome).toBe(true);
  policies.set(id, { flattenedAbilities: { read: true, update: true } });
  expect(getKnowledgePresentation(path, stores).hideArticleChrome).toBe(false);
});

test("an editor reading an article keeps the normal interface", () => {
  addDocument({ read: true, update: true });
  expect(getKnowledgePresentation(path, stores).hideSidebar).toBe(false);
});

test.each([true, false])(
  "archived article uses unarchive grant %s",
  (unarchive) => {
    addDocument({ read: true, update: false, unarchive }, { isArchived: true });
    expect(getKnowledgePresentation(path, stores).hideArticleChrome).toBe(
      !unarchive
    );
  }
);

test("does not reuse the previous article's policy", () => {
  addDocument({ read: true, update: true });
  expect(
    getKnowledgePresentation("/doc/other-klmnopqrst", stores).pending
  ).toBe(true);
});

test("reacts to permission revocation and policy invalidation", () => {
  addDocument({ read: true, update: false });
  policies.set(id, { flattenedAbilities: { read: false, update: false } });
  expect(getKnowledgePresentation(path, stores).hideArticleChrome).toBe(false);
  policies.delete(id);
  expect(getKnowledgePresentation(path, stores).pending).toBe(true);
});

test.each([{ isDeleted: true }, { isTemplate: true }])(
  "keeps the existing deleted/template interface",
  (attributes) => {
    addDocument({ read: true, update: false }, attributes);
    expect(getKnowledgePresentation(path, stores).hideArticleChrome).toBe(
      false
    );
  }
);
