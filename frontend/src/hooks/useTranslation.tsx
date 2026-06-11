import {
  useState,
  useEffect,
  useContext,
  createContext,
  type ReactNode,
} from "react";
import { translations, type LangType } from "../config/translations";

interface LanguageContextType {
  t: (typeof translations)["zh"];
  lang: LangType;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LangType>(() => {
    return (localStorage.getItem("app_lang") as LangType) || "zh";
  });

  useEffect(() => {
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  const toggleLang = () => setLang((prev) => (prev === "zh" ? "en" : "zh"));

  return (
    <LanguageContext.Provider
      value={{ t: translations[lang], lang, toggleLang }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context)
    throw new Error("useTranslation must be used within a LanguageProvider");
  return context;
}
