import { matchPath } from "react-router-dom";
import type Document from "~/models/Document";

interface PresentationStores {
  documents: {
    get(
      id: string
    ):
      | Pick<Document, "id" | "isArchived" | "isDeleted" | "isTemplate">
      | undefined;
  };
  policies: {
    get(
      id: string
    ): { flattenedAbilities: Record<string, boolean> } | undefined;
  };
}
import { matchDocumentSlug } from "./routeHelpers";

/** Resolve presentation from the current route and its document policy. */
export function getKnowledgePresentation(
  pathname: string,
  { documents, policies }: PresentationStores
) {
  const isSearch = !!matchPath(pathname, {
    path: "/search/:query?",
    exact: true,
  });
  const article = matchPath<{ documentSlug: string }>(pathname, {
    path: `/doc/${matchDocumentSlug}`,
    exact: true,
  });
  const document = article
    ? documents.get(article.params.documentSlug)
    : undefined;
  const can = document
    ? policies.get(document.id)?.flattenedAbilities
    : undefined;
  const pending = !!article && (!document || !can || can.read === undefined);
  // Deleted documents and templates keep their existing management interfaces.
  // Unarchive retains the effective write grant when update is false due to archiving.
  const viewOnly =
    !!document &&
    !document.isDeleted &&
    !document.isTemplate &&
    can?.read === true &&
    can.update === false &&
    (!document.isArchived || can.unarchive === false);
  const hideArticleChrome = !!article && (pending || viewOnly);

  return {
    hideSidebar: isSearch || hideArticleChrome,
    hideArticleChrome,
    pending,
  };
}
