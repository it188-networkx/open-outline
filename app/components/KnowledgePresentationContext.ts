import { createContext, useContext } from "react";

/** Presentation rules are scoped to authenticated knowledge base pages. */
export const KnowledgePresentationContext = createContext({
  hideSidebar: false,
  hideArticleChrome: false,
  pending: false,
});

/** Read the presentation selected by the authenticated layout. */
export function useKnowledgePresentation() {
  return useContext(KnowledgePresentationContext);
}
