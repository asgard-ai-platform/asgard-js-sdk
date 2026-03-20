import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

interface FileDropContextValue {
  droppedFiles: File[];
  clearDroppedFiles: () => void;
  isDraggingOver: boolean;
  setDroppedFiles: (files: File[]) => void;
  setIsDraggingOver: (value: boolean) => void;
}

const FileDropContext = createContext<FileDropContextValue | null>(null);

export function FileDropContextProvider({ children }: { children: ReactNode }): ReactNode {
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const clearDroppedFiles = useCallback((): void => {
    setDroppedFiles([]);
  }, []);

  return (
    <FileDropContext.Provider
      value={{
        droppedFiles,
        clearDroppedFiles,
        isDraggingOver,
        setDroppedFiles,
        setIsDraggingOver,
      }}
    >
      {children}
    </FileDropContext.Provider>
  );
}

export function useFileDropContext(): FileDropContextValue {
  const context = useContext(FileDropContext);
  if (!context) {
    throw new Error('useFileDropContext must be used within a FileDropContextProvider');
  }

  return context;
}
