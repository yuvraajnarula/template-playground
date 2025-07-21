import { compress, decompress } from "../utils/compression/compression";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface VersionRecord {
  id: string;
  parentId: string | null;
  timestamp: string;
  author: {
    id: string;
    name: string;
  };
  componentType: 'templateMarkdown' | 'modelCto' | 'data';
  content: string;
  changeDescription?: string;
  comments: CommentRecord[];
}

export interface CommentRecord {
  id: string;
  text: string;
  author: string;
  timestamp: string;
  resolved: boolean;
  anchor?: {
    startOffset: number;
    endOffset: number;
  };
}

export interface VersionState {
  versions: VersionRecord[];
  currentVersionId: string | null;
  isVersionMode: boolean;
  isDiffMode: boolean;
  selectedComparisonVersions: [string?, string?];
  currentAuthor: {
    id: string;
    name: string;
  };
  lastContent: {
    templateMarkdown?: string;
    modelCto?: string;
    data?: string;
  };
}

const STORAGE_KEYS = {
  VERSIONS: 'accord-playground-versions',
  AUTHOR: 'accord-playground-author',
} as const;

export class VersionManager {
  private static instance: VersionManager;
  private versions: Map<string, VersionRecord> = new Map();

  private constructor() {
    this.loadVersionsFromStorage();
  }

  static getInstance(): VersionManager {
    if (!VersionManager.instance) {
      VersionManager.instance = new VersionManager();
    }
    return VersionManager.instance;
  }

  private generateId(): string {
    return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createVersion(
    componentType: 'templateMarkdown' | 'modelCto' | 'data',
    content: string,
    author: { id: string; name: string },
    changeDescription?: string,
    parentId?: string
  ): VersionRecord {
    const version: VersionRecord = {
      id: this.generateId(),
      parentId: parentId || null,
      timestamp: new Date().toISOString(),
      author,
      componentType,
      content,
      changeDescription,
      comments: [],
    };

    this.versions.set(version.id, version);
    this.saveVersionsToStorage();
    return version;
  }

  getVersion(id: string): VersionRecord | undefined {
    return this.versions.get(id);
  }

  getAllVersions(): VersionRecord[] {
    return Array.from(this.versions.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  getVersionsByComponent(componentType: string): VersionRecord[] {
    return this.getAllVersions().filter(v => v.componentType === componentType);
  }

  getVersionHistory(componentType: string): VersionRecord[] {
    const componentVersions = this.getVersionsByComponent(componentType);
    
    const childrenMap = new Map<string, VersionRecord[]>();
    const rootVersions: VersionRecord[] = [];

    componentVersions.forEach(version => {
      if (version.parentId) {
        if (!childrenMap.has(version.parentId)) {
          childrenMap.set(version.parentId, []);
        }
        childrenMap.get(version.parentId)!.push(version);
      } else {
        rootVersions.push(version);
      }
    });

    const history: VersionRecord[] = [];
    const visited = new Set<string>();

    const traverse = (version: VersionRecord) => {
      if (visited.has(version.id)) return;
      visited.add(version.id);
      history.push(version);
      
      const children = childrenMap.get(version.id) || [];
      children.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      children.forEach(traverse);
    };

    rootVersions
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(traverse);

    return history;
  }

  addComment(versionId: string, text: string, author: string): CommentRecord | null {
    const version = this.versions.get(versionId);
    if (!version) return null;

    const comment: CommentRecord = {
      id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      author,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    version.comments.push(comment);
    this.saveVersionsToStorage();
    return comment;
  }

  toggleCommentResolved(versionId: string, commentId: string): boolean {
    const version = this.versions.get(versionId);
    if (!version) return false;

    const comment = version.comments.find(c => c.id === commentId);
    if (!comment) return false;

    comment.resolved = !comment.resolved;
    this.saveVersionsToStorage();
    return true;
  }

  deleteVersion(id: string): boolean {
    return this.versions.delete(id);
  }

  clearAllVersions(): void {
    this.versions.clear();
    this.saveVersionsToStorage();
  }

  getVersionStats(): {
    total: number;
    byComponent: Record<string, number>;
    totalComments: number;
  } {
    const stats = {
      total: this.versions.size,
      byComponent: {} as Record<string, number>,
      totalComments: 0,
    };

    this.versions.forEach(version => {
      stats.byComponent[version.componentType] = 
        (stats.byComponent[version.componentType] || 0) + 1;
      stats.totalComments += version.comments.length;
    });

    return stats;
  }

  private saveVersionsToStorage(): void {
    try {
      const versionsArray = Array.from(this.versions.values());
      const compressed = compress(versionsArray);
      localStorage.setItem(STORAGE_KEYS.VERSIONS, compressed);
    } catch (error) {
      console.warn('Failed to save versions to localStorage:', error);
      this.cleanupOldVersions();
    }
  }

  private loadVersionsFromStorage(): void {
    try {
      const compressed = localStorage.getItem(STORAGE_KEYS.VERSIONS);
      if (compressed) {
        const versionsArray: VersionRecord[] = decompress(compressed);
        this.versions.clear();
        versionsArray.forEach(version => {
          this.versions.set(version.id, version);
        });
      }
    } catch (error) {
      console.warn('Failed to load versions from localStorage:', error);
      this.versions.clear();
    }
  }

  private cleanupOldVersions(keepCount: number = 50): void {
    const sortedVersions = this.getAllVersions();
    if (sortedVersions.length <= keepCount) return;

    const versionsToDelete = sortedVersions.slice(keepCount);
    versionsToDelete.forEach(version => {
      this.versions.delete(version.id);
    });

    this.saveVersionsToStorage();
    console.log(`Cleaned up ${versionsToDelete.length} old versions`);
  }

  exportVersions(): string {
    const versionsArray = Array.from(this.versions.values());
    return compress(versionsArray);
  }
  importVersions(compressedData: string, merge: boolean = false): boolean {
    try {
      const versionsArray: VersionRecord[] = decompress(compressedData);
      
      if (!merge) {
        this.versions.clear();
      }

      versionsArray.forEach(version => {
        // Avoid ID conflicts when merging
        if (merge && this.versions.has(version.id)) {
          version.id = this.generateId();
        }
        this.versions.set(version.id, version);
      });

      this.saveVersionsToStorage();
      return true;
    } catch (error) {
      console.error('Failed to import versions:', error);
      return false;
    }
  }
}
