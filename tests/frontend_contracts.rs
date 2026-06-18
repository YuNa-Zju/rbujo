use std::fs;
use std::path::Path;

fn read_file(path: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    fs::read_to_string(root.join(path)).unwrap_or_else(|error| {
        panic!("failed to read {path}: {error}");
    })
}

#[test]
fn search_modal_exposes_native_tag_filter() {
    let source = read_file("frontend/src/components/modals/SearchModal.tsx");

    assert!(
        source.contains("selectedTags"),
        "SearchModal should keep native tag filter state"
    );
    assert!(
        source.contains("tags: selectedTags"),
        "SearchModal should pass selected native tags into entryService.search"
    );
}

#[test]
fn tag_inputs_offer_existing_native_tag_suggestions() {
    let tag_cache = read_file("frontend/src/context/TagCacheContext.tsx");
    let add_entry = read_file("frontend/src/components/modals/AddEntryModal.tsx");
    let search_modal = read_file("frontend/src/components/modals/SearchModal.tsx");
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");

    assert!(
        tag_cache.contains("allTags"),
        "TagCacheContext should expose known native tags"
    );
    assert!(
        tag_cache.contains("entryService.listTags"),
        "TagCacheContext should refresh known tags through the native tag list command"
    );
    assert!(
        add_entry.contains("filteredTagSuggestions"),
        "AddEntryModal should show matching existing tag suggestions"
    );
    assert!(
        search_modal.contains("filteredTagSuggestions"),
        "SearchModal should show matching existing tag suggestions"
    );
    assert!(
        command_palette.contains("useTagCache"),
        "GlobalCommandPalette should use known native tags"
    );
    assert!(
        command_palette.contains("filteredTagSuggestions"),
        "GlobalCommandPalette should show matching tag suggestions"
    );
    assert!(
        command_palette.contains("t.command?.tagMenu"),
        "GlobalCommandPalette should expose a visible tag search section"
    );
    assert!(
        command_palette.contains("entry.tags"),
        "GlobalCommandPalette should include native tags in entry matching"
    );
}

#[test]
fn command_palette_places_tags_between_data_and_app_groups() {
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");

    let data = command_palette
        .find("t.command?.data")
        .expect("Data group should exist");
    let tags = command_palette
        .find("t.command?.tagMenu")
        .expect("Tag group should exist");
    let app = command_palette
        .find("t.command?.app")
        .expect("App group should exist");

    assert!(
        data < tags && tags < app,
        "Command palette should render tag suggestions after data tools and before app settings"
    );
}

#[test]
fn settings_modal_uses_card_and_capsule_controls() {
    let source = read_file("frontend/src/components/modals/SettingsModalController.tsx");

    assert!(
        source.contains("SettingsActionCard"),
        "Settings modal should render primary actions as card-style controls"
    );
    assert!(
        source.contains("SettingsPill"),
        "Settings modal should expose compact capsule status controls"
    );
    assert!(
        source.contains("rounded-full") && source.contains("rounded-3xl"),
        "Settings modal should keep the app's capsule and card visual language"
    );
}

#[test]
fn frontend_prefers_backend_summaries_and_backend_overview_cache() {
    let entry_display = read_file("frontend/src/features/entry/EntryDisplay.tsx");
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");
    let entry_action_view = read_file("frontend/src/components/modals/cmdk/EntryActionView.tsx");
    let entry_actions = read_file("frontend/src/features/entry/useEntryActions.ts");
    let journal_data = read_file("frontend/src/hooks/useJournalData.ts");
    let cache_storage = read_file("frontend/src/utils/cacheStorage.ts");
    let markdown_viewer = read_file("frontend/src/components/MarkdownViewer.tsx");
    let year_grid = read_file("frontend/src/features/calendar/components/YearGrid.tsx");

    assert!(
        entry_display.contains("backendSummary"),
        "EntryDisplay should prefer the backend summary supplied on entries"
    );
    assert!(
        command_palette.contains("entry.summary") && entry_action_view.contains("entry.summary"),
        "Command palette entry previews should use backend summaries before falling back"
    );
    assert!(
        !journal_data.contains("cacheStorage.loadOverview")
            && !journal_data.contains("cacheStorage.saveOverview")
            && !cache_storage.contains("OVERVIEW_CACHE_KEY"),
        "Overview dots should not be persisted in frontend IndexedDB"
    );
    assert!(
        !journal_data.contains("newData.map((e: any) => ({")
            && !journal_data.contains("const newState = { ...prev };"),
        "Frontend should not rebuild overview dots through heavy local mutation paths"
    );
    assert!(
        journal_data.contains("entryEventBus.on(\"entry:update\", handleOptimisticUpdate)")
            && !journal_data.contains("entryEventBus.on(\"entry:update\", handleSilentRefresh)")
            && !journal_data
                .contains("entryEventBus.on(\"entry:status_change\", handleSilentRefresh)"),
        "Optimistic entry events should update local cache without re-fetching stale backend data"
    );
    assert!(
        journal_data.contains("delete merged.summary"),
        "Optimistic content edits should drop stale backend summaries"
    );
    assert!(
        journal_data.contains("const existingIndex")
            && journal_data.contains("targetEntries.splice(existingIndex, 1, dot)")
            && journal_data.contains("targetEntries.unshift(dot)")
            && !journal_data.contains("[...(nextCache[targetDate] || []), dot]"),
        "Optimistic overview dots should preserve the same order as the daily entry list instead of appending updated dots to the end"
    );
    assert!(
        entry_actions.contains("delete currentUpdate.summary"),
        "Optimistic edit payloads should not carry stale backend summaries"
    );
    assert!(
        markdown_viewer.contains("if (!backendUploadReferences?.length) return localReferences")
            && markdown_viewer
                .contains("new Set([...backendUploadReferences, ...localReferences])"),
        "MarkdownViewer should keep frontend upload extraction as a fallback/union"
    );
    assert!(
        year_grid.contains("overviewMap") && !year_grid.contains("entryMap"),
        "Year view should consume backend grouped overview data instead of reducing entries locally"
    );
}

#[test]
fn calendar_uses_desktop_card_stack_surface() {
    let calendar_page = read_file("frontend/src/features/calendar/CalendarPage.tsx");
    let daily_sheet = read_file("frontend/src/features/calendar/components/DailySheetCard.tsx");
    let swipe_surface =
        read_file("frontend/src/features/calendar/components/SwipeCalendarSurface.tsx");

    assert!(
        calendar_page.contains("SwipeCalendarSurface")
            && calendar_page.contains("DailySheetCard")
            && !calendar_page.contains("CalendarGrid"),
        "CalendarPage should use the desktop card-stack calendar and daily sheet components"
    );
    assert!(
        swipe_surface.contains("CALENDAR_PAGE_OFFSETS")
            && swipe_surface.contains("[-1, 0, 1]")
            && swipe_surface.contains("addMonths")
            && swipe_surface.contains("addWeeks"),
        "SwipeCalendarSurface should pre-render previous/current/next pages for month and week navigation"
    );
    assert!(
        swipe_surface.contains("drag=\"x\"")
            && swipe_surface.contains("dragDirectionLock")
            && swipe_surface.contains("onDragEnd")
            && swipe_surface.contains("onWheel"),
        "SwipeCalendarSurface should support drag and trackpad page navigation"
    );
    assert!(
        daily_sheet.contains("drag=\"y\"")
            && daily_sheet.contains("onDragEnd")
            && daily_sheet.contains("isManualSorting")
            && daily_sheet.contains("onCollapseCalendar")
            && daily_sheet.contains("onExpandCalendar"),
        "DailySheetCard should own the vertical pull gesture and disable it during sorting"
    );
}

#[test]
fn calendar_selected_day_is_fixed_circle() {
    let swipe_surface =
        read_file("frontend/src/features/calendar/components/SwipeCalendarSurface.tsx");
    let calendar_dots = read_file("frontend/src/features/calendar/components/CalendarDots.tsx");

    assert!(
        swipe_surface.contains("DAY_BUTTON_SIZE_CLASS")
            && swipe_surface.contains("w-7 h-7")
            && swipe_surface.contains("rounded-full"),
        "Selected day should use a fixed square button with full rounding, not a stretched capsule"
    );
    assert!(
        swipe_surface.contains("CalendarDots")
            && swipe_surface.contains("calendar-day-dots")
            && swipe_surface.contains("CALENDAR_DOTS_POSITION_CLASS")
            && swipe_surface.contains("absolute bottom-0 left-1/2")
            && !swipe_surface.contains("rounded-lg active:scale-90"),
        "Dots should be anchored inside each date cell instead of flowing into adjacent rows"
    );
    assert!(
        calendar_dots.contains("memo(")
            && calendar_dots.contains("CALENDAR_DOT_ROW_CLASS")
            && calendar_dots.contains("AnimatePresence")
            && calendar_dots.contains("motion.div")
            && calendar_dots.contains("layout"),
        "CalendarDots should keep memoized compact markers while preserving the layout animation used for dot swaps during sorting"
    );
}

#[test]
fn calendar_card_stack_preserves_desktop_space_and_side_dots() {
    let calendar_page = read_file("frontend/src/features/calendar/CalendarPage.tsx");
    let daily_sheet = read_file("frontend/src/features/calendar/components/DailySheetCard.tsx");
    let swipe_surface =
        read_file("frontend/src/features/calendar/components/SwipeCalendarSurface.tsx");

    assert!(
        swipe_surface.contains("CALENDAR_CARD_WIDTH_STYLE")
            && swipe_surface.contains("920px")
            && swipe_surface.contains("MONTH_SURFACE_HEIGHT = 340")
            && swipe_surface.contains("MONTH_CARD_MIN_HEIGHT = 292")
            && swipe_surface.contains("w-7 h-7")
            && swipe_surface.contains("h-[38px]"),
        "Calendar card stack should use desktop-sized width while keeping month view compact enough to reveal daily todos"
    );
    assert!(
        calendar_page.contains("pt-3 pb-2")
            && calendar_page.contains("btn btn-primary h-11")
            && daily_sheet.contains(" p-2"),
        "Calendar page chrome and the new-entry footer should stay compact enough to keep todos visible"
    );
    assert!(
        swipe_surface.contains("SIDE_PAGE_OPACITY")
            && swipe_surface.contains("SIDE_PAGE_TRANSLATE_PERCENT = \"50%\"")
            && swipe_surface.contains("CALENDAR_CARD_RADIUS_CLASS")
            && swipe_surface.contains("overflow-hidden")
            && swipe_surface.contains("calendar-side-page-dots")
            && swipe_surface.contains("showDotsOnSidePages"),
        "Previous and next calendar pages should keep their rounded corners visible and still render overview dots"
    );
    assert!(
        !swipe_surface
            .contains("absolute inset-x-0 top-4 z-10 pointer-events-none flex justify-center"),
        "Calendar surface should not add a floating duplicate view-mode pill above the main card"
    );
}

#[test]
fn calendar_navigation_has_desktop_motion_and_bar_toggle() {
    let calendar_page = read_file("frontend/src/features/calendar/CalendarPage.tsx");
    let calendar_state = read_file("frontend/src/hooks/useCalendarState.ts");
    let journal_data = read_file("frontend/src/hooks/useJournalData.ts");
    let swipe_surface =
        read_file("frontend/src/features/calendar/components/SwipeCalendarSurface.tsx");
    let daily_sheet = read_file("frontend/src/features/calendar/components/DailySheetCard.tsx");

    assert!(
        calendar_state.contains("navDirection")
            && calendar_page.contains("navDirection={navDirection}")
            && swipe_surface.contains("NAVIGATION_ANIMATION_DISTANCE"),
        "Calendar navigation should expose direction so wheel and button changes animate between pages"
    );
    assert!(
        journal_data.contains("refreshCalendarOverview")
            && journal_data.contains("entryService.getRangeOverview")
            && journal_data.contains("subMonths")
            && journal_data.contains("addMonths")
            && journal_data.contains("subWeeks")
            && journal_data.contains("addWeeks"),
        "Calendar overview should prefetch previous/current/next page ranges so side cards can render dots"
    );
    assert!(
        daily_sheet.contains("SHEET_WHEEL_THRESHOLD")
            && daily_sheet.contains("handleSheetWheel")
            && daily_sheet.contains("onToggleCalendar")
            && daily_sheet.contains("aria-label")
            && daily_sheet.contains("onClick={onToggleCalendar}"),
        "Daily sheet grabber should support desktop-friendly wheel and click toggles between month/week views"
    );
}

#[test]
fn entry_card_allows_action_tooltips_to_escape_card_bounds() {
    let entry_card = read_file("frontend/src/components/DraggableEntryCard.tsx");

    assert!(
        entry_card.contains("ENTRY_CARD_RADIUS_CLASS")
            && entry_card.contains("ENTRY_CARD_OVERFLOW_CLASS")
            && entry_card.contains("rounded-2xl")
            && entry_card.contains("overflow-visible"),
        "Entry cards should keep a rounded surface while allowing action menus and tooltips to render outside card bounds"
    );
    assert!(
        !entry_card.contains("ENTRY_CARD_VISUAL_CLIP_CLASS")
            && !entry_card.contains("ENTRY_CARD_VISUAL_CLIP_CLASS = \"overflow-hidden\""),
        "Entry cards should not use a card-level overflow-hidden clip because it cuts off action tooltips"
    );
}

#[test]
fn tag_search_modal_clips_its_animated_rounded_surface() {
    let tag_modal = read_file("frontend/src/components/modals/TagSearchModal.tsx");
    let css = read_file("frontend/src/index.css");

    assert!(
        tag_modal.contains("tag-search-modal-shell")
            && tag_modal.contains("tag-search-modal-surface"),
        "TagSearchModal should split animated shell and clipped content surface"
    );
    assert!(
        tag_modal.contains("backgroundColor: colors.modalBg"),
        "TagSearchModal should paint its own modal background instead of relying only on dynamic Tailwind classes"
    );
    assert!(
        css.contains(".tag-search-modal-shell")
            && css.contains("--tag-search-modal-radius: 2rem 2rem 0 0")
            && css.contains(".tag-search-modal-surface")
            && css.contains("clip-path: inset(0 round var(--tag-search-modal-radius))")
            && css.contains("-webkit-clip-path: inset(0 round var(--tag-search-modal-radius))")
            && css.contains("-webkit-mask-image: -webkit-radial-gradient(white, black)")
            && css.contains("contain: paint")
            && css.contains("isolation: isolate"),
        "TagSearchModal surface should use paint containment, clip-path, and a WebKit mask so blurred children cannot bleed past rounded corners"
    );
    assert!(
        css.contains("@media (min-width: 640px)")
            && css.contains("--tag-search-modal-radius: 1rem"),
        "TagSearchModal should use full rounded corners on desktop while preserving the mobile bottom-sheet shape"
    );
    assert!(
        !tag_modal.contains("backgroundColor: colors.cardBg")
            && !tag_modal.contains("borderColor: colors.cardBorder"),
        "Tag search result cards should not paint the square EntryCard wrapper behind the rounded card surface"
    );
}

#[test]
fn tag_suggestions_are_sorted_without_hiding_later_tags() {
    let add_entry = read_file("frontend/src/components/modals/AddEntryModal.tsx");
    let search_modal = read_file("frontend/src/components/modals/SearchModal.tsx");

    assert!(
        add_entry.contains("if (!needle) return a.localeCompare(b)")
            && search_modal.contains("if (!needle) return a.localeCompare(b)"),
        "Tag suggestions should sort alphabetically before slicing so tags like ACEE are visible even before typing"
    );
    assert!(
        !add_entry.contains("if (!needle) return 0")
            && !search_modal.contains("if (!needle) return 0"),
        "Empty tag suggestion ordering should not preserve arbitrary backend order"
    );
    assert!(
        !add_entry.contains(".slice(0, 8)") && !search_modal.contains(".slice(0, 8)"),
        "Add/search tag suggestion lists should not hide later English tags behind a fixed count limit"
    );
}

#[test]
fn tag_pills_use_data_theme_dark_styles() {
    let tag_pill = read_file("frontend/src/components/markdown/TagPill.tsx");
    let css = read_file("frontend/src/index.css");

    assert!(
        tag_pill.contains("tag-pill")
            && tag_pill.contains("tag-pill-task")
            && tag_pill.contains("tag-pill-idea")
            && tag_pill.contains("tag-pill-event")
            && !tag_pill.contains("dark:bg")
            && !tag_pill.contains("dark:text"),
        "TagPill should use app theme-aware classes instead of Tailwind dark variants"
    );
    assert!(
        css.contains("[data-theme=\"dark\"] .tag-pill-task")
            && css.contains("[data-theme=\"dark\"] .tag-pill-idea")
            && css.contains("[data-theme=\"dark\"] .tag-pill-event")
            && css.contains("[data-theme=\"dark\"] .tag-pill-disabled"),
        "Tag pill colors should adapt to daisyUI data-theme dark mode"
    );
}

#[test]
fn add_entry_tag_suggestions_support_keyboard_selection() {
    let source = read_file("frontend/src/components/modals/AddEntryModal.tsx");
    let tag_input_source = read_file("frontend/src/components/shared/TagInput.tsx");

    assert!(
        source.contains("highlightedTagSuggestionIndex"),
        "AddEntryModal should track the highlighted tag suggestion"
    );
    assert!(
        source.contains("<TagInput"),
        "AddEntryModal should render the shared tag input"
    );
    assert!(
        tag_input_source.contains("ArrowDown") && tag_input_source.contains("ArrowUp"),
        "AddEntryModal tag input should support arrow-key suggestion navigation"
    );
    assert!(
        tag_input_source.contains("aria-selected"),
        "AddEntryModal should expose the highlighted suggestion to assistive technologies"
    );
}

#[test]
fn ui_events_replay_open_events_emitted_before_listeners_mount() {
    let source = read_file("frontend/src/lib/uiEvents.ts");

    assert!(
        source.contains("pendingEvents"),
        "uiEvents should keep startup events emitted before listeners mount"
    );
    assert!(
        source.contains("replayableEvents"),
        "uiEvents should only replay modal-opening events"
    );
}

#[test]
fn cmd_palette_open_event_is_not_replayed_later() {
    let ui_events = read_file("frontend/src/lib/uiEvents.ts");
    let modal_controller = read_file("frontend/src/context/ModalControllerContext.tsx");
    let replayable_start = ui_events
        .find("private replayableEvents")
        .expect("uiEvents should define replayableEvents");
    let replayable_end = ui_events[replayable_start..]
        .find("]);")
        .map(|offset| replayable_start + offset)
        .expect("replayableEvents should be a static event list");
    let replayable_block = &ui_events[replayable_start..replayable_end];

    assert!(
        !replayable_block.contains("OPEN_CMD_PALETTE"),
        "CmdK open events are transient and should not replay after another modal opens"
    );
    assert!(
        modal_controller.contains("uiEvents.on(\"OPEN_CMD_PALETTE\"")
            && modal_controller.contains("commandPaletteOpen"),
        "ModalController should own the CmdK open listener and state"
    );
}

#[test]
fn header_cmdk_button_uses_modal_controller_directly() {
    let header_actions =
        read_file("frontend/src/features/calendar/components/HeaderActionTrigger.tsx");

    assert!(
        header_actions.contains("useModalController"),
        "HeaderActionTrigger should use ModalController for CmdK state"
    );
    assert!(
        header_actions.contains("openCommandPalette()"),
        "Header CmdK button should open the command palette directly"
    );
    assert!(
        !header_actions.contains("uiEvents.emit(\"OPEN_CMD_PALETTE\")"),
        "Header CmdK button should not depend on the uiEvents bridge"
    );
}

#[test]
fn production_frontend_does_not_include_ui_debug_logging() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    assert!(
        !root.join("frontend/src/lib/debugLog.ts").exists(),
        "Production frontend should not include the UI debug helper"
    );

    for path in [
        "frontend/src/lib/uiEvents.ts",
        "frontend/src/context/ModalControllerContext.tsx",
        "frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx",
        "frontend/src/features/calendar/CalendarPage.tsx",
        "frontend/src/features/calendar/components/HeaderActionTrigger.tsx",
    ] {
        let source = read_file(path);
        assert!(
            !source.contains("debugLog")
                && !source.contains("rbujo_debug_ui")
                && !source.contains("[rbujo-ui:"),
            "{path} should not include UI debug logging in production"
        );
    }
}

#[test]
fn tauri_setup_does_not_block_window_on_text_tag_migration() {
    let source = read_file("src-tauri/src/lib.rs");

    assert!(
        !source.contains("block_on(backend.migrate_text_tags_to_native())"),
        "Tauri setup should not synchronously scan all entries for legacy text tags before showing the window"
    );
    assert!(
        source.contains("async fn list_tags"),
        "Tauri should expose a lightweight native tag list command"
    );
}

#[test]
fn future_log_modal_does_not_mix_archive_tab_into_future_log() {
    let source = read_file("frontend/src/components/modals/FutureLogModal.tsx");

    assert!(
        !source.contains("activeTab"),
        "FutureLogModal should not keep active/archive tab state"
    );
    assert!(
        !source.contains("setActiveTab"),
        "FutureLogModal should not expose archive tab switching"
    );
    assert!(
        !source.contains("No archived items"),
        "FutureLogModal should not render archived-item empty states"
    );
}

#[test]
fn archive_is_exposed_from_all_global_menus() {
    let user_menu = read_file("frontend/src/features/calendar/components/UserMenu.tsx");
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");
    let tauri_menu = read_file("src-tauri/src/lib.rs");

    assert!(
        user_menu.contains("navigate(\"/archive\")"),
        "User menu should navigate to archive"
    );
    assert!(
        command_palette.contains("navigate(\"/archive\")"),
        "Command palette should navigate to archive"
    );
    assert!(
        tauri_menu.contains("menu:archive"),
        "Native desktop menu should emit archive menu events"
    );
}
