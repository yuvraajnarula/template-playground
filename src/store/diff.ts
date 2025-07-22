export interface DiffResult {
  type: 'added' | 'deleted' | 'modified' | 'unchanged';
  oldValue?: string;
  newValue?: string;
  position?: {
    start: number;
    end: number;
  };
  lineNumber?: number;
}

export interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffResult[];
}

export class DiffCalculator {
    static calculateDiff(oldC : string, newC : string): DiffResult[]{
        const diffs: DiffResult[] = [];
        if (oldC === newC) return diffs;

        const oldLines = oldC.split('\n'),
            newLines = newC.split('\n'),
            lcs = this.calcLCS(oldLines,newLines),
            changes = this.buildChanges(oldLines,newLines,lcs);

        return changes;
    }
    private static calcLCS(oldLines: string[], newLines: string[]): number[][] {
        const m = oldLines.length, n = newLines.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    }

    private static buildChanges(oldLines: string[], newLines: string[], lcs: number[][]): DiffResult[] {
        const changes: DiffResult[] = [];
        let i = oldLines.length, j = newLines.length;
        while(i > 0 || j < 0){
            if (i>0 && j  > 0 && oldLines[i-1] === newLines[j-1]){
                changes.unshift({
                    type: 'unchanged',
                    oldValue: oldLines[i - 1],
                    newValue: newLines[j - 1],
                    position: { start: i - 1, end: i },
                    lineNumber: i
                })
                i--;
                j--;
            } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
                changes.unshift({
                type: 'added',
                newValue: newLines[j - 1],
                lineNumber: j - 1,
                position: { start: 0, end: newLines[j - 1].length }
                });
                j--;
            } else if (i > 0 && (j === 0 || lcs[i][j - 1] < lcs[i - 1][j])) {
                changes.unshift({
                    type: 'deleted',
                    oldValue: oldLines[i - 1],
                    lineNumber: i - 1,
                    position: { start: 0, end: oldLines[i - 1].length
                }});
                i--;
            }
        }
        return this.optimizedChanges(changes);
    }

    private static optimizedChanges(changes: DiffResult[]): DiffResult[] {
        const optimized: DiffResult[] = [];
        let lastChange: DiffResult | null = null;

        for (const change of changes) {
            if (lastChange && lastChange.type === change.type) {
                if (change.type === 'added' || change.type === 'modified') {
                    lastChange.newValue += '\n' + change.newValue;
                } else if (change.type === 'deleted') {
                    lastChange.oldValue += '\n' + change.oldValue;
                }
            } else {
                optimized.push(change);
                lastChange = change;
            }
        }
        return optimized;
    }

    static calculateWordDiff(oldL : string, newL: string): DiffResult[] {
        const oldW = oldL.split(/(\s+)/),
            newW = newL.split(/(\s+)/),
            changes: DiffResult[] = [];
        let oldI = 0, newI = 0;

        while(oldI < oldW.length || newI< newW.length){
            if (oldI < oldW.length && newI < newW.length &&
                oldW[oldI] === newW[newI]
            ){
                changes.push({
                    type : 'unchanged',
                    oldValue: oldW[oldI],
                    newValue: newW[newI],
                })
                oldI++;
                newI++;
            } else {
                let found = false;
                for (let i = newI + 1; i < newW.length && !found; i++){
                    if(oldI < oldW.length && oldW[oldI] === newW[i]){
                        for (let j = newI; j < i; j++){
                            changes.push({
                                type: 'added',
                                newValue: newW[j],
                            })
                        }
                        newI = i; 
                        found = true;
                    }
                }
                
                if(!found){
                    if (oldI < oldW.length) {
                        changes.push({
                            type: 'deleted',
                            oldValue: oldW[oldI],
                        });
                        oldI++;
                    }
                    if (newI < newW.length){
                        changes.push({
                            type: 'added',
                            newValue: newW[newI],
                        });
                        newI++;
                    }
                }
            }
        }
        return changes;
    }

    static getChangeStats(oldC : string, newC : string) : {
            added: number;
            deleted: number;
            modified: number;
            linesAdded: number;
            linesDeleted: number;
            linesModified: number;
            charactersAdded: number;
            charactersDeleted: number;
    } {
        const oldL = oldC.split('\n'),
              newL = newC.split('\n'),
              diffs = this.calculateDiff(oldC, newC);
    
        let linesAdded = 0;
        let linesDeleted = 0;
        let linesModified = 0;
        let charactersAdded = 0;
        let charactersDeleted = 0;

        diffs.forEach(diff => {
            switch (diff.type) {
                case 'added':
                    linesAdded++;
                    charactersAdded += diff.newValue?.length || 0;
                    break;
                
                case 'deleted':
                    linesDeleted++;
                    charactersDeleted += diff.oldValue?.length || 0;
                    break;
                case 'modified':
                    linesModified++;
                    charactersAdded += diff.newValue?.length || 0;
                    charactersDeleted += diff.oldValue?.length || 0;
                    break;
            }
        })
        return {
      added: Math.max(0, newL.length - oldL.length),
      deleted: Math.max(0, oldL.length - newL.length),
      modified: Math.min(oldL.length, newL.length),
      linesAdded,
      linesDeleted,
      linesModified,
      charactersAdded,
      charactersDeleted,
    };
    }

    static generateDiffChunks(diffs: DiffResult[], contextLines : number = 3): DiffChunk[] {
        const chunks: DiffChunk[] = [];
        let curr: DiffChunk | null = null;

        diffs.forEach((diff,idx)=>{
            if (diff.type !== 'unchanged' || this.shouldIncludeContext(diffs,idx, contextLines)) {
                if (!curr){
                    curr = {
                        oldStart: Math.max(0, (diff.lineNumber || 0) - contextLines),
                        oldLines: 0,
                        newStart: Math.max(0, (diff.lineNumber || 0) - contextLines),
                        newLines: 0,
                        changes: []
                    }
                }
                curr.changes.push(diff);
                if (diff.type === 'added' || diff.type==='unchanged') {
                    curr.newLines++;
                } 
                if (diff.type === 'deleted' || diff.type==='unchanged') {
                    curr.oldLines++;
                }
                else if (curr){
                    chunks.push(curr);
                    curr = null;
                }
            }
        })
        return chunks;
    }

    private static shouldIncludeContext(diffs: DiffResult[], index: number, contextLines: number): boolean {
        for (let i = Math.max(0, index - contextLines); i <= Math.min(diffs.length - 1, index + contextLines); i++) {
            if (diffs[i].type !== 'unchanged') {
                return true;
            }
        }
        return false;
    }
}