import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CalendarPage from "./features/calendar/CalendarPage";
import DailyPage from "./features/daily/DailyPage";
import ArchivePage from "./features/archive/ArchivePage";
import { EntryModalProvider } from "./context/EntryModalContext";
import GlobalEntryModals from "./components/modals/GlobalEntryModals";
import GlobalUIModals from "./components/modals/GlobalUIModals";
import GlobalCommandPalette from "./components/modals/cmdk/GlobalCommandPalette";
import { ModalControllerProvider } from "./context/ModalControllerContext";
import { Toaster } from "sonner";

export default function App() {
  return (
    <EntryModalProvider>
      <BrowserRouter>
        <ModalControllerProvider>
          <GlobalCommandPalette />

          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/daily/:dateStr" element={<DailyPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <GlobalEntryModals />
          <GlobalUIModals />
          <Toaster
            position="bottom-center"
            expand={false}
            visibleToasts={3}
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-full !border !border-base-content/10 !bg-base-100/95 !px-5 !py-3 !shadow-2xl !backdrop-blur-xl !text-base-content",
                title: "!text-sm !font-medium !tracking-tight",
                actionButton:
                  "!rounded-full !bg-primary !px-4 !py-1.5 !text-xs !font-semibold !text-primary-content hover:!bg-primary/90",
                success: "!rounded-full !border-success/20 !bg-success/10 !text-success",
                error: "!rounded-full !border-error/20 !bg-error/10 !text-error",
              },
            }}
          />
        </ModalControllerProvider>
      </BrowserRouter>
    </EntryModalProvider>
  );
}
