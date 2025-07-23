import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { debounce } from "ts-debounce";
import { ModelManager } from "@accordproject/concerto-core";
import { TemplateMarkInterpreter } from "@accordproject/template-engine";
import { TemplateMarkTransformer } from "@accordproject/markdown-template";
import { transform } from "@accordproject/markdown-transform";
import { SAMPLES, Sample } from "../samples";
import * as playground from "../samples/playground";
import { compress, decompress } from "../utils/compression/compression";
import { AIConfig, ChatState } from '../types/components/AIAssistant.types';
import { VersionManager, VersionState } from "./version/version";
import { createVersionStoreMethods, VersionStoreMethods, VersionUtils, withVersionTracking } from "./version/utils";
import { AuthManager } from "./version/authorManager";
import { DiffCalculator } from "./version/diff";

interface AppState extends VersionState {
  templateMarkdown: string;
  editorValue: string;
  modelCto: string;
  editorModelCto: string;
  data: string;
  editorAgreementData: string;
  agreementHtml: string;
  error: string | undefined;
  samples: Array<Sample>;
  sampleName: string;
  isAIConfigOpen: boolean;
  isAIChatOpen: boolean;
  backgroundColor: string;
  textColor: string;
  chatState: ChatState;
  aiConfig: AIConfig | null;
  chatAbortController: AbortController | null;
  
  setTemplateMarkdown: (template: string, description?: string) => Promise<void>;
  setEditorValue: (value: string) => void;
  setModelCto: (model: string, description?: string) => Promise<void>;
  setEditorModelCto: (value: string) => void;
  setData: (data: string, description?: string) => Promise<void>;
  setEditorAgreementData: (value: string) => void;
  rebuild: () => Promise<void>;
  init: () => Promise<void>;
  loadSample: (name: string) => Promise<void>;
  generateShareableLink: () => string;
  loadFromLink: (compressedData: string) => Promise<void>;
  toggleDarkMode: () => void;
  setAIConfigOpen: (visible: boolean) => void;
  setAIChatOpen: (visible: boolean) => void;
  setChatState: (state: ChatState) => void;
  updateChatState: (partial: Partial<ChatState>) => void;
  setAIConfig: (config: AIConfig | null) => void;
  setChatAbortController: (controller: AbortController | null) => void;
  resetChat: () => void;
  
  // Version-aware operations
  commitCurrentChanges: (description?: string) => void;
  revertToVersion: (versionId: string) => Promise<void>;
  createBranchFromVersion: (versionId: string, description?: string) => Promise<void>;
  getDiffPreview: (oldVersionId: string, newVersionId: string) => {
    templateMarkdown?: any[];
    modelCto?: any[];
    data?: any[];
  };
}

export interface DecompressedData {
  templateMarkdown: string;
  modelCto: string;
  data: string;
  agreementHtml: string;
}

const rebuildDeBounce = debounce(rebuild, 500);

async function rebuild(template: string, model: string, dataString: string) {
  const modelManager = new ModelManager({ strict: true });
  modelManager.addCTOModel(model, undefined, true);
  await modelManager.updateExternalModels();
  const engine = new TemplateMarkInterpreter(modelManager, {});
  const templateMarkTransformer = new TemplateMarkTransformer();
  const templateMarkDom = templateMarkTransformer.fromMarkdownTemplate(
    { content: template },
    modelManager,
    "contract",
    { verbose: false }
  );
  const data = JSON.parse(dataString);
  const ciceroMark = await engine.generate(templateMarkDom, data);
  return await transform(
    ciceroMark.toJSON(),
    "ciceromark_parsed",
    ["html"],
    {},
    { verbose: false }
  );
}

const useAppStore = create<AppState & VersionStoreMethods>()(
  immer(
    devtools((set, get) => {
      // Create version store methods
      const versionMethods = createVersionStoreMethods(set, get);
      
      // Initialize author and version manager
      const currentAuthor = AuthManager.getCurrentAuthor();
      const versionManager = VersionManager.getInstance();

      return {
        // Base state
        backgroundColor: '#ffffff',
        textColor: '#121212',
        sampleName: playground.NAME,
        templateMarkdown: playground.TEMPLATE,
        editorValue: playground.TEMPLATE,
        modelCto: playground.MODEL,
        editorModelCto: playground.MODEL,
        data: JSON.stringify(playground.DATA, null, 2),
        editorAgreementData: JSON.stringify(playground.DATA, null, 2),
        agreementHtml: "",
        isAIConfigOpen: false,
        isAIChatOpen: false,
        error: undefined,
        samples: SAMPLES,
        chatState: {
          messages: [],
          isLoading: false,
          error: null,
        },
        aiConfig: null,
        chatAbortController: null,

        versions: versionManager.getAllVersions(),
        currentVersionId: null,
        isVersionMode: false,
        isDiffMode: false,
        selectedComparisonVersions: [undefined, undefined] as [string?, string?],
        currentAuthor,
        lastContent: {},
        
        ...versionMethods,

        init: async () => {
          const params = new URLSearchParams(window.location.search);
          const compressedData = params.get("data");
          if (compressedData) {
            await get().loadFromLink(compressedData);
          } else {
            await get().rebuild();
          }

          const state = get();
          const initialContent = {
            templateMarkdown: state.templateMarkdown,
            modelCto: state.modelCto,
            data: state.data
          };

          set((prevState) => ({
            lastContent: initialContent
          }));

          if (state.templateMarkdown.trim() || state.modelCto.trim() || state.data.trim()) {
            setTimeout(() => {
              get().commitCurrentChanges("Initial version");
            }, 100);
          }
        },

        loadSample: async (name: string) => {
          const sample = SAMPLES.find((s) => s.NAME === name);
          if (sample) {
            set(() => ({
              sampleName: sample.NAME,
              agreementHtml: undefined,
              error: undefined,
              templateMarkdown: sample.TEMPLATE,
              editorValue: sample.TEMPLATE,
              modelCto: sample.MODEL,
              editorModelCto: sample.MODEL,
              data: JSON.stringify(sample.DATA, null, 2),
              editorAgreementData: JSON.stringify(sample.DATA, null, 2),
            }));
            await get().rebuild();
            
            get().commitCurrentChanges(`Loaded sample: ${name}`);
          }
        },

        rebuild: async () => {
          const { templateMarkdown, modelCto, data } = get();
          try {
            const result = await rebuildDeBounce(templateMarkdown, modelCto, data);
            set(() => ({ agreementHtml: result, error: undefined }));
          } catch (error: any) {
            set(() => ({ error: formatError(error) }));
          }
        },

        setTemplateMarkdown: async (template: string, description?: string) => {
          const originalSetter = async (value: string) => {
            set(() => ({ templateMarkdown: value }));
            const { modelCto, data } = get();
            try {
              const result = await rebuildDeBounce(value, modelCto, data);
              set(() => ({ agreementHtml: result, error: undefined }));
            } catch (error: any) {
              set(() => ({ error: formatError(error) }));
            }
          };

          const versionAwareSetter = withVersionTracking(
            originalSetter,
            'templateMarkdown',
            get().createVersion
          );

          await versionAwareSetter(template, description);
        },

        setEditorValue: (value: string) => {
          set(() => ({ editorValue: value }));
        },

        setModelCto: async (model: string, description?: string) => {
          const originalSetter = async (value: string) => {
            set(() => ({ modelCto: value }));
            const { templateMarkdown, data } = get();
            try {
              const result = await rebuildDeBounce(templateMarkdown, value, data);
              set(() => ({ agreementHtml: result, error: undefined }));
            } catch (error: any) {
              set(() => ({ error: formatError(error) }));
            }
          };

          const versionAwareSetter = withVersionTracking(
            originalSetter,
            'modelCto',
            get().createVersion
          );

          await versionAwareSetter(model, description);
        },

        setEditorModelCto: (value: string) => {
          set(() => ({ editorModelCto: value }));
        },

        setData: async (data: string, description?: string) => {
          const originalSetter = async (value: string) => {
            set(() => ({ data: value }));
            try {
              const result = await rebuildDeBounce(
                get().templateMarkdown,
                get().modelCto,
                value
              );
              set(() => ({ agreementHtml: result, error: undefined }));
            } catch (error: any) {
              set(() => ({ error: formatError(error) }));
            }
          };

          const versionAwareSetter = withVersionTracking(
            originalSetter,
            'data',
            get().createVersion
          );

          await versionAwareSetter(data, description);
        },

        setEditorAgreementData: (value: string) => {
          set(() => ({ editorAgreementData: value }));
        },

        generateShareableLink: () => {
          const state = get();
          const compressedData = compress({
            templateMarkdown: state.templateMarkdown,
            modelCto: state.modelCto,
            data: state.data,
            agreementHtml: state.agreementHtml,
          });
          return `${window.location.origin}?data=${compressedData}`;
        },

        loadFromLink: async (compressedData: string) => {
          try {
            const { templateMarkdown, modelCto, data, agreementHtml } = decompress(compressedData);
            if (!templateMarkdown || !modelCto || !data) {
              throw new Error("Invalid share link data");
            }
            set(() => ({
              templateMarkdown,
              editorValue: templateMarkdown,
              modelCto,
              editorModelCto: modelCto,
              data,
              editorAgreementData: data,
              agreementHtml,
              error: undefined,
            }));
            await get().rebuild();
            
            get().commitCurrentChanges("Loaded from shared link");
          } catch (error) {
            set(() => ({
              error: "Failed to load shared content: " + (error instanceof Error ? error.message : "Unknown error"),
            }));
          }
        },

        toggleDarkMode: () => {
          set((state) => {
            const isDark = state.backgroundColor === '#121212';
            return {
              backgroundColor: isDark ? '#ffffff' : '#121212',
              textColor: isDark ? '#121212' : '#ffffff',
            };
          });
        },

        setAIConfigOpen: (isOpen: boolean) => set(() => ({ isAIConfigOpen: isOpen })),
        setAIChatOpen: (isOpen: boolean) => set(() => ({ isAIChatOpen: isOpen })),
        setChatState: (state) => set({ chatState: state }),
        updateChatState: (partial) => set((state) => ({ 
          chatState: { ...state.chatState, ...partial } 
        })),
        setAIConfig: (config) => set({ aiConfig: config }),
        setChatAbortController: (controller) => set({ chatAbortController: controller }),
        resetChat: () => {
          const chatAbortController = get().chatAbortController;
          if (chatAbortController) {
            chatAbortController.abort();
            get().setChatAbortController(null);
          }
          get().setChatState({
            messages: [],
            isLoading: false,
            error: null,
          });
        },

        commitCurrentChanges: (description?: string) => {
          const state = get();
          const components = ['templateMarkdown', 'modelCto', 'data'] as const;
          
          components.forEach(componentType => {
            const currentContent = state[componentType];
            const lastContent = state.lastContent?.[componentType] || '';
            
            if (VersionUtils.hasMeaningfulChanges(lastContent, currentContent)) {
              get().createVersion(
                componentType,
                description || VersionUtils.generateChangeDescription(
                  componentType,
                  lastContent,
                  currentContent
                )
              );
            }
          });
        },

        revertToVersion: async (versionId: string) => {
          const version = versionManager.getVersion(versionId);
          if (!version) {
            throw new Error(`Version ${versionId} not found`);
          }

          // Store current state as a new version before reverting
          get().commitCurrentChanges(`Before reverting to version ${versionId.substring(0, 8)}`);

          // Load the version
          await get().loadVersion(versionId);
          
          // Create a new version for the revert action
          get().commitCurrentChanges(`Reverted to version ${versionId.substring(0, 8)}: ${version.changeDescription || 'No description'}`);
        },

        createBranchFromVersion: async (versionId: string, description?: string) => {
          const version = versionManager.getVersion(versionId);
          if (!version) {
            throw new Error(`Version ${versionId} not found`);
          }

          // Load the version content
          await get().loadVersion(versionId);
          
          // Create a new version as a branch
          const branchDescription = description || `Branched from version ${versionId.substring(0, 8)}`;
          get().commitCurrentChanges(branchDescription);
        },

        getDiffPreview: (oldVersionId: string, newVersionId: string) => {
          const oldVersion = versionManager.getVersion(oldVersionId);
          const newVersion = versionManager.getVersion(newVersionId);
          
          if (!oldVersion || !newVersion) {
            return {};
          }

          const diffs: any = {};
          const components = ['templateMarkdown', 'modelCto', 'data'] as const;
          
          components.forEach(componentType => {
            if (oldVersion.componentType === componentType || newVersion.componentType === componentType) {
              const oldContent = oldVersion.componentType === componentType ? oldVersion.content : '';
              const newContent = newVersion.componentType === componentType ? newVersion.content : '';
              
              if (oldContent !== newContent) {
                diffs[componentType] = DiffCalculator.calculateDiff(oldContent, newContent);
              }
            }
          });

          return diffs;
        },
      };
    })
  )
);

export default useAppStore;

function formatError(error: any): string {
  console.error(error);
  if (typeof error === "string") return error;
  if (Array.isArray(error)) return error.map((e) => formatError(e)).join("\n");
  if (error.code) {
    const sub = error.errors ? formatError(error.errors) : "";
    const msg = error.renderedMessage || "";
    return `Error: ${error.code} ${sub} ${msg}`;
  }
  return error.toString();

}
// Hook for version statistics
export const useVersionStats = () => {
  const store = useAppStore();
  return store.getVersionStats();
};

export const useVersionHistory = (componentType?: string) => {
  const store = useAppStore();
  return store.getVersionHistory(componentType);
};

export const useDiffPreview = (oldVersionId?: string, newVersionId?: string) => {
  const store = useAppStore();
  if (!oldVersionId || !newVersionId) return {};
  return store.getDiffPreview(oldVersionId, newVersionId);
};