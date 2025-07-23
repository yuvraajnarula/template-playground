import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { DiffCalculator } from "./diff";
import { AuthManager } from "./authorManager";
import { VersionManager, VersionRecord, VersionState } from "./version";

export const VersionUtils = {
  hasMeaningfulChanges(oldContent: string, newContent: string): boolean {
    const normalize = (str: string) => str.trim().replace(/\s+/g, ' ');
    const oldNormalized =normalize(oldContent);
    const newNormalized = normalize(newContent);const lengthDiff = Math.abs(newContent.length - oldContent.length);
    return lengthDiff > 5 || oldNormalized !== newNormalized;
  },
  generateChangeDescription(
    componentType: 'templateMarkdown' | 'modelCto' | 'data',
    oldContent: string,
    newContent: string
  ): string {
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    const lineDiff = newLines - oldLines;
    
    const componentNames = {
      templateMarkdown: 'Template',
      modelCto: 'Model',
      data: 'Data'
    };
    
    const name = componentNames[componentType] || 'Content';
    
    if (lineDiff > 0) {
      return `${name}: Added ${lineDiff} lines`;
    } else if (lineDiff < 0) {
      return `${name}: Removed ${Math.abs(lineDiff)} lines`;
    } else {
      return `${name}: Modified content`;
    }
  },

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  },

  validateVersion(version: Partial<VersionRecord>): boolean {
    return !!(
      version.id &&
      version.timestamp &&
      version.author?.id &&
      version.author?.name &&
      version.componentType &&
      typeof version.content === 'string'
    );
  }
};

export default VersionManager;

export interface VersionStoreMethods {
  createVersion: (
    componentType: 'templateMarkdown' | 'modelCto' | 'data',
    changeDescription?: string
  ) => void;
  loadVersion: (versionId: string) => Promise<void>;
  deleteVersion: (versionId: string) => boolean;
  
  getVersionHistory: (componentType?: string) => VersionRecord[];
  setComparisonVersions: (oldVersionId?: string, newVersionId?: string) => void;
  toggleVersionMode: () => void;
  toggleDiffMode: () => void;
  
  addComment: (versionId: string, comment: string) => void;
  toggleCommentResolved: (versionId: string, commentId: string) => void;
  
  setCurrentAuthor: (author: { id: string; name: string }) => void;
  
  getVersionStats: () => {
    total: number;
    byComponent: Record<string, number>;
    totalComments: number;
  };
  
  exportVersions: () => string;
  importVersions: (compressedData: string, merge?: boolean) => boolean;
  clearAllVersions: () => void;
}

export function createVersionStoreMethods(
  set: any,
  get: any
): VersionStoreMethods {
  const versionManager = VersionManager.getInstance();

  return {
    createVersion: (
      componentType: 'templateMarkdown' | 'modelCto' | 'data',
      changeDescription?: string
    ) => {
      const state = get();
      const currentAuthor = state.currentAuthor || AuthManager.getCurrentAuthor();
      const currentContent = state[componentType];
      const lastContent = state.lastContent?.[componentType] || '';

      if (VersionUtils.hasMeaningfulChanges(lastContent, currentContent)) {
        const version = versionManager.createVersion(
          componentType,
          currentContent,
          currentAuthor,
          changeDescription || VersionUtils.generateChangeDescription(
            componentType,
            lastContent,
            currentContent
          )
        );

        set((state: any) => {
          const newLastContent = { ...state.lastContent };
          newLastContent[componentType] = currentContent;
          
          return {
            versions: versionManager.getAllVersions(),
            currentVersionId: version.id,
            lastContent: newLastContent
          };
        });
      }
    },

    loadVersion: async (versionId: string) => {
      const version = versionManager.getVersion(versionId);
      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      set((state: any) => {
        const updates: any = {
          currentVersionId: versionId,
        };

        // Update the appropriate content field
        switch (version.componentType) {
          case 'templateMarkdown':
            updates.templateMarkdown = version.content;
            updates.editorValue = version.content;
            break;
          case 'modelCto':
            updates.modelCto = version.content;
            updates.editorModelCto = version.content;
            break;
          case 'data':
            updates.data = version.content;
            updates.editorAgreementData = version.content;
            break;
        }

        return updates;
      });

      const { rebuild } = get();
      if (rebuild) {
        await rebuild();
      }
    },

    deleteVersion: (versionId: string) => {
      const success = versionManager.deleteVersion(versionId);
      if (success) {
        set((state: any) => ({
          versions: versionManager.getAllVersions(),
          currentVersionId: state.currentVersionId === versionId ? null : state.currentVersionId
        }));
      }
      return success;
    },

    getVersionHistory: (componentType?: string) => {
      return componentType 
        ? versionManager.getVersionHistory(componentType)
        : versionManager.getAllVersions();
    },

    setComparisonVersions: (oldVersionId?: string, newVersionId?: string) => {
      set(() => ({
        selectedComparisonVersions: [oldVersionId, newVersionId] as [string?, string?]
      }));
    },

    toggleVersionMode: () => {
      set((state: any) => ({
        isVersionMode: !state.isVersionMode
      }));
    },

    toggleDiffMode: () => {
      set((state: any) => ({
        isDiffMode: !state.isDiffMode
      }));
    },

    addComment: (versionId: string, comment: string) => {
      const state = get();
      const author = state.currentAuthor?.name || 'Anonymous';
      
      const commentRecord = versionManager.addComment(versionId, comment, author);
      if (commentRecord) {
        set(() => ({
          versions: versionManager.getAllVersions()
        }));
      }
    },

    toggleCommentResolved: (versionId: string, commentId: string) => {
      const success = versionManager.toggleCommentResolved(versionId, commentId);
      if (success) {
        set(() => ({
          versions: versionManager.getAllVersions()
        }));
      }
    },

    setCurrentAuthor: (author: { id: string; name: string }) => {
      AuthManager.setCurrentAuthor(author);
      set(() => ({
        currentAuthor: author
      }));
    },

    getVersionStats: () => {
      return versionManager.getVersionStats();
    },

    exportVersions: () => {
      return versionManager.exportVersions();
    },

    importVersions: (compressedData: string, merge = false) => {
      const success = versionManager.importVersions(compressedData, merge);
      if (success) {
        set(() => ({
          versions: versionManager.getAllVersions()
        }));
      }
      return success;
    },

    clearAllVersions: () => {
      versionManager.clearAllVersions();
      set(() => ({
        versions: [],
        currentVersionId: null,
        selectedComparisonVersions: [undefined, undefined] as [string?, string?],
        lastContent: {}
      }));
    }
  };
}

// Enhanced store creator that extends existing AppState
export function createVersionEnabledStore<T extends Record<string, any>>(
  storeConfig: any,
  initialVersionState: Partial<VersionState> = {}
) {
  return create<T & VersionState & VersionStoreMethods>()(
    immer(
      devtools((set, get) => {
        const versionMethods = createVersionStoreMethods(set, get);
        const baseStore = typeof storeConfig === 'function' ? storeConfig(set, get) : storeConfig;
        
        // Initialize author
        const currentAuthor = AuthManager.getCurrentAuthor();
        
        return {
          ...baseStore,
          
          versions: VersionManager.getInstance().getAllVersions(),
          currentVersionId: null,
          isVersionMode: false,
          isDiffMode: false,
          selectedComparisonVersions: [undefined, undefined] as [string?, string?],
          currentAuthor,
          lastContent: {},
          
          ...initialVersionState,
          
          ...versionMethods,
        };
      })
    )
  );
}

export const withVersionTracking = <T extends string>(
  originalSetter: (value: T) => Promise<void> | void,
  componentType: 'templateMarkdown' | 'modelCto' | 'data',
  createVersionFn: (componentType: any, description?: string) => void
) => {
  return async (value: T, description?: string) => {
    await originalSetter(value);
    
    createVersionFn(componentType, description);
  };
};

export const initializeVersionStore = (store: any) => {
  const originalInit = store.getState().init;
  
  if (originalInit) {
    store.setState({
      init: async () => {
        await originalInit();
        
        const state = store.getState();
        if (state.setCurrentAuthor) {
          state.setCurrentAuthor(AuthManager.getCurrentAuthor());
        }
        
        ['templateMarkdown', 'modelCto', 'data'].forEach((componentType) => {
          const content = state[componentType];
          if (content && state.createVersion) {
            store.setState((prevState: any) => ({
              lastContent: {
                ...prevState.lastContent,
                [componentType]: content
              }
            }));
          }
        });
      }
    });
  }
};