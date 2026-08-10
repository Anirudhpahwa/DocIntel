import type { DocumentItem, DocumentTree, FolderNode } from "@/lib/api";

/** Recursively counts every document/folder nested under a folder (not including itself). */
export function countContents(node: Pick<FolderNode, "folders" | "documents">): {
  documents: number;
  folders: number;
} {
  let documents = node.documents.length;
  let folders = 0;

  for (const child of node.folders) {
    folders += 1;
    const nested = countContents(child);
    documents += nested.documents;
    folders += nested.folders;
  }

  return { documents, folders };
}

export function findFolderById(tree: DocumentTree, id: number): FolderNode | null {
  function search(nodes: FolderNode[]): FolderNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = search(node.folders);
      if (found) return found;
    }
    return null;
  }
  return search(tree.folders);
}

export function findDocumentById(tree: DocumentTree, id: number): DocumentItem | null {
  function search(folders: FolderNode[], rootDocuments: DocumentItem[]): DocumentItem | null {
    const direct = rootDocuments.find((d) => d.id === id);
    if (direct) return direct;
    for (const folder of folders) {
      const found = search(folder.folders, folder.documents);
      if (found) return found;
    }
    return null;
  }
  return search(tree.folders, tree.documents);
}

export interface FlatDocument {
  document: DocumentItem;
  /** Immediate containing folder's name, or null for a top-level orphan document. */
  folderName: string | null;
}

/**
 * Every document in the tree, at any depth, alongside its immediate
 * parent folder's name (Phase 6D) -- used by the Dashboard to compute
 * real status counts and a "recent documents" list without a second
 * fetch or a duplicate tree-walking implementation. Every field here
 * comes straight from the existing `/api/documents/tree` response.
 */
export function flattenDocuments(tree: DocumentTree): FlatDocument[] {
  const result: FlatDocument[] = [];

  function walk(folders: FolderNode[], documents: DocumentItem[], folderName: string | null) {
    for (const document of documents) {
      result.push({ document, folderName });
    }
    for (const folder of folders) {
      walk(folder.folders, folder.documents, folder.name);
    }
  }

  walk(tree.folders, tree.documents, null);
  return result;
}
