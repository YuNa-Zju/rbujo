import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CalendarPage from "./features/calendar/CalendarPage";
import DailyPage from "./features/daily/DailyPage";
import ArchivePage from "./features/archive/ArchivePage";
import { EntryModalProvider } from "./context/EntryModalContext";
import GlobalEntryModals from "./components/modals/GlobalEntryModals";
import GlobalUIModals from "./components/modals/GlobalUIModals";
import GlobalCommandPalette from "./components/modals/cmdk/GlobalCommandPalette";

export default function App() {
  return (
    <EntryModalProvider>
      <BrowserRouter>
        <GlobalCommandPalette />

        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/daily/:dateStr" element={<DailyPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <GlobalEntryModals />
        <GlobalUIModals />
      </BrowserRouter>
    </EntryModalProvider>
  );
}
