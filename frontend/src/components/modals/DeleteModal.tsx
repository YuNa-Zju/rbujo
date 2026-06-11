import type { RefObject } from "react";
import { Trash2, Archive } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isTask: boolean;
  isSoftDeleteAvailable: boolean;
  onSoftDelete: () => void;
  onHardDelete: () => void;
}

export default function DeleteModal({
  dialogRef,
  isTask,
  isSoftDeleteAvailable,
  onSoftDelete,
  onHardDelete,
}: Props) {
  const { t } = useTranslation();

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-box p-6 rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <h3 className="font-bold text-xl mb-6 text-error flex items-center gap-2">
          <Trash2 size={24} /> {t.entry.deleteTitle}
        </h3>

        <p className="py-2 text-base text-base-content/80 font-medium mb-4">
          {isTask ? t.entry.deleteTaskQ : t.entry.deleteEntryQ}
        </p>

        <div className="flex flex-col gap-3">
          {/* 软删除选项 */}
          {isTask && isSoftDeleteAvailable && (
            <button
              className="btn btn-outline h-auto py-4 px-4 w-full gap-4 justify-start rounded-2xl border-base-300 hover:border-warning hover:bg-warning/5 transition-all group"
              onClick={onSoftDelete}
            >
              <div className="bg-warning/10 p-2.5 rounded-xl text-warning group-hover:bg-warning group-hover:text-warning-content transition-colors">
                <Archive size={22} />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-base font-bold text-base-content">
                  {t.entry.softDelete}
                </span>
                <span className="text-xs opacity-60 font-normal mt-0.5">
                  {t.entry.softDeleteDesc}
                </span>
              </div>
            </button>
          )}

          {/* 硬删除选项 */}
          <button
            className="btn btn-outline h-auto py-4 px-4 w-full gap-4 justify-start rounded-2xl border-base-300 hover:border-error hover:bg-error/5 transition-all group"
            onClick={onHardDelete}
          >
            <div className="bg-error/10 p-2.5 rounded-xl text-error group-hover:bg-error group-hover:text-error-content transition-colors">
              <Trash2 size={22} />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-base font-bold text-base-content">
                {t.entry.hardDelete}
              </span>
              <span className="text-xs opacity-60 font-normal mt-0.5">
                {t.entry.hardDeleteDesc}
              </span>
            </div>
          </button>
        </div>

        <div className="modal-action mt-6">
          <form method="dialog" className="w-full">
            <button className="btn btn-ghost w-full rounded-full">
              {t.entry.cancelDelete}
            </button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
