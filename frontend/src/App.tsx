import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { EntryModalProvider } from "./context/EntryModalContext";
import { ModalControllerProvider } from "./context/ModalControllerContext";
import { Toaster } from "sonner";
import NativeMenuBridge from "./components/NativeMenuBridge";

const GlobalModalHost = lazy(() => import("./components/modals/GlobalModalHost"));
const GlobalCommandPalette = lazy(
  () => import("./components/modals/cmdk/GlobalCommandPalette"),
);
const CalendarPage = lazy(() => import("./features/calendar/CalendarPage"));
const DailyPage = lazy(() => import("./features/daily/DailyPage"));
const ArchivePage = lazy(() => import("./features/archive/ArchivePage"));

export default function App() {
  return (
    <EntryModalProvider>
      <BrowserRouter>
        <ModalControllerProvider>
          <NativeMenuBridge />
          <Suspense fallback={null}>
            <GlobalCommandPalette />
          </Suspense>

          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<CalendarPage />} />
              <Route path="/daily/:dateStr" element={<DailyPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          <Suspense fallback={null}>
            <GlobalModalHost />
          </Suspense>
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
