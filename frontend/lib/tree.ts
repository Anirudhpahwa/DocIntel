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
