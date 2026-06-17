import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function NativeMenuBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const register = async () => {
      try {
        unlisten = await listen("menu:archive", () => {
          navigate("/archive");
        });
      } catch (error) {
        console.warn("Native archive menu listener registration failed", error);
        return;
      }

      if (disposed && unlisten) {
        unlisten();
      }
    };

    register();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
