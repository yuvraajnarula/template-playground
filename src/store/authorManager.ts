
const STORAGE_KEYS = {
  VERSIONS: 'accord-playground-versions',
  AUTHOR: 'accord-playground-author',
} as const;

export class AuthManager {
    static getCurrentAuthor() : {
        id : string,
        name : string
    } {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.AUTHOR);
            if (stored){
                return JSON.parse(stored);
            }
        }
        catch (err){
            console.warn(`Failed to load author from storage`, err);
        }    

        const defaultAuthor = {
            id : `u_${Date.now()}`,
            name : `User_${Date.now()}`
        }

        this.setCurrentAuthor(defaultAuthor);
        return defaultAuthor;
    }

    static setCurrentAuthor(
        author : {
            id: string,
            name : string
        }) : void {
            try {
                localStorage.setItem(STORAGE_KEYS.AUTHOR, JSON.stringify(author));
            } catch (err) {
                console.warn(`Failed to save author to storage`, err);
            }
        }
    
}