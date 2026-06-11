import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useCallback,
} from "react";

type ModalType = "migrate" | "future" | "delete" | null;

interface EntryModalContextType {
  activeModal: ModalType;
  selectedEntry: any | null;
  openModal: (type: ModalType, entry: any) => void;
  closeModal: () => void;
}

const EntryModalContext = createContext<EntryModalContextType | undefined>(
  undefined,
);

export function EntryModalProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  const openModal = useCallback((type: ModalType, entry: any) => {
    setSelectedEntry(entry);
    setActiveModal(type);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setSelectedEntry(null);
  }, []);

  return (
    <EntryModalContext.Provider
      value={{ activeModal, selectedEntry, openModal, closeModal }}
    >
      {children}
    </EntryModalContext.Provider>
  );
}

export function useEntryModal() {
  const context = useContext(EntryModalContext);
  if (!context) {
    throw new Error("useEntryModal must be used within an EntryModalProvider");
  }
  return context;
}
