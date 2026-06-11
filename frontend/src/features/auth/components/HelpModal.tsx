import { useRef, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { X, PenTool, ShieldCheck, Moon, Repeat, Languages } from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation";
import { ENTRY_THEME } from "../../../config/entryTheme";

export interface HelpModalRef {
  open: () => void;
  close: () => void;
}

const HelpModal = forwardRef<HelpModalRef>((_, ref) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t, lang, toggleLang } = useTranslation();

  useImperativeHandle(ref, () => ({
    open: () => dialogRef.current?.showModal(),
    close: () => dialogRef.current?.close(),
  }));

  const taskTheme = ENTRY_THEME.task;
  const ideaTheme = ENTRY_THEME.idea;
  const eventTheme = ENTRY_THEME.event;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      // ✅ 修复 1: 移除这里多余的 style 和 onClick
      // DaisyUI 的 modal 类配合原生 dialog 已经处理了 backdrop
      // 这里的 onClick 是多余的，因为下面的 modal-backdrop form 已经处理了点击外部关闭
    >
      <div className="modal-box w-[calc(100%-2rem)] max-w-2xl p-0 bg-base-100 shadow-2xl rounded-[2rem] overflow-hidden m-4 border border-base-content/5 relative z-10">
        {/* === Header === */}
        <div className="bg-base-100 px-6 py-5 flex justify-between items-center sticky top-0 z-20 border-b border-base-200/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-sm border border-primary/10">
              <PenTool size={20} strokeWidth={2.5} />
            </div>
            <h3 className="font-bold text-lg text-base-content leading-tight">
              {t.guide?.title || "User Guide"}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost gap-2 bg-base-200/50 hover:bg-base-200 rounded-full px-3 font-medium text-xs border border-transparent"
              onClick={toggleLang}
            >
              <Languages size={14} />
              {lang === "zh" ? "EN" : "中"}
            </button>

            <form method="dialog">
              <button className="btn btn-sm btn-circle btn-ghost bg-base-200/50 hover:bg-base-200 text-base-content/60">
                <X size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* === Content === */}
        <div className="px-6 pb-8 pt-6 overflow-y-auto max-h-[70vh] space-y-8 bg-base-50/50">
          {/* 1. Intro */}
          <section>
            <div className="p-5 bg-base-100 rounded-2xl border border-base-200/60 shadow-sm">
              <h4 className="font-bold text-base mb-2 text-base-content flex items-center gap-2">
                👋 {t.guide?.welcome || "Welcome"}
              </h4>
              <p className="text-sm text-base-content/70 leading-relaxed">
                {t.guide?.welcomeDesc || "Bullet Journal is a method..."}
              </p>
            </div>
          </section>

          {/* 2. Key Symbols */}
          <section>
            <h4 className="font-bold text-xs uppercase tracking-widest text-base-content/40 mb-3 px-1">
              {t.guide?.key || "Key Symbols"}
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <SymbolItem
                theme={taskTheme}
                title={t.guide?.keyTask || "Task"}
                desc={t.guide?.keyTaskDesc || "Actionable items"}
              />
              <SymbolItem
                theme={ideaTheme}
                title={t.guide?.keyIdea || "Idea"}
                desc={t.guide?.keyIdeaDesc || "Notes & thoughts"}
              />
              <SymbolItem
                theme={eventTheme}
                title={t.guide?.keyEvent || "Event"}
                desc={t.guide?.keyEventDesc || "Time-specific"}
              />
            </div>
          </section>

          {/* 3. Workflow */}
          <section>
            <h4 className="font-bold text-xs uppercase tracking-widest text-base-content/40 mb-4 px-1">
              {t.guide?.workflow || "Workflow"}
            </h4>
            <div className="relative pl-2">
              <WorkflowStep
                step={1}
                title={t.guide?.step1 || "Capture"}
                desc={t.guide?.step1Desc || "Write down everything"}
              />
              <WorkflowStep
                step={2}
                title={t.guide?.step2 || "Reflect"}
                desc={t.guide?.step2Desc || "Review daily"}
                icon={<Moon size={12} />}
              />
              <WorkflowStep
                step={3}
                title={t.guide?.step3 || "Migrate"}
                desc={t.guide?.step3Desc || "Move unfinished tasks"}
                icon={<Repeat size={12} />}
              />
              <WorkflowStep
                step={4}
                title={t.guide?.step4 || "Sync"}
                desc={t.guide?.step4Desc || "Calendar integration"}
                isLast
              />
            </div>
          </section>

          {/* 4. Privacy */}
          <section className="bg-gradient-to-br from-success/10 to-success/5 p-5 rounded-2xl border border-success/10 flex gap-4 items-start">
            <div className="p-2.5 bg-white/50 dark:bg-black/20 rounded-xl text-success shrink-0 shadow-sm backdrop-blur-sm">
              <ShieldCheck size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-success-content mb-1">
                {t.guide?.privacy || "Privacy First"}
              </h4>
              <p className="text-xs text-base-content/60 leading-relaxed">
                {t.guide?.privacyDesc || "Your data is yours."}
              </p>
            </div>
          </section>
        </div>

        {/* === Footer === */}
        <div className="p-4 bg-base-100 border-t border-base-200/50 flex justify-center sticky bottom-0 z-20">
          <form method="dialog" className="w-full sm:w-auto">
            <button className="btn btn-primary w-full sm:w-48 rounded-xl shadow-lg shadow-primary/20 text-white font-bold tracking-wide">
              {t.guide?.btnGotIt || "Got it"}
            </button>
          </form>
        </div>
      </div>

      {/* 🚀 核心修复 2: 移除 bg-black/40 */}
      {/* 这里的 modal-backdrop 只需要负责捕获点击事件，颜色交给 DaisyUI 默认或浏览器原生处理 */}
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>,
    document.body,
  );
});

// ... Helper Components 保持不变 (SymbolItem, WorkflowStep)
const SymbolItem = ({ theme, title, desc }: any) => {
  const Icon = theme.icon;
  return (
    <div
      className={`
          flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-300
          hover:shadow-md hover:-translate-y-0.5
          ${theme.softBg}
          ${theme.color}
          border-current/10
      `}
    >
      <div className="flex items-center justify-between">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center bg-base-100/80 shadow-sm`}
        >
          <Icon size={20} strokeWidth={2.5} className={theme.color} />
        </div>
      </div>
      <div>
        <span className="font-bold text-sm block mb-0.5 opacity-90">
          {title}
        </span>
        <span className="text-[11px] opacity-70 leading-tight block font-medium">
          {desc}
        </span>
      </div>
    </div>
  );
};

const WorkflowStep = ({ step, title, desc, icon, isLast }: any) => (
  <div className="flex gap-4 relative pb-8 last:pb-0 group">
    {!isLast && (
      <div className="absolute left-[11px] top-8 bottom-0 w-px bg-base-300 group-hover:bg-primary/30 transition-colors" />
    )}
    <div className="flex-none w-6 h-6 rounded-full bg-base-100 border-2 border-base-200 group-hover:border-primary group-hover:text-primary text-base-content/30 flex items-center justify-center text-[10px] font-bold transition-all z-10 shadow-sm group-hover:scale-110">
      {step}
    </div>
    <div className="-mt-1.5 p-2 rounded-lg hover:bg-base-200/50 transition-colors flex-1 -ml-2 pl-4">
      <strong className="text-sm text-base-content flex items-center gap-2 mb-1">
        {title}
        {icon && (
          <span className="p-1 rounded-md bg-base-200 text-base-content/60">
            {icon}
          </span>
        )}
      </strong>
      <span className="text-xs text-base-content/60 block leading-relaxed">
        {desc}
      </span>
    </div>
  </div>
);

export default HelpModal;
