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
    let command_palette =
        read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");

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
fn command_palette_places_tags_above_settings_near_bottom() {
    let command_palette =
        read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");

    let tools = command_palette
        .find("t.command?.tools")
        .expect("Tools group should exist");
    let tags = command_palette
        .find("t.command?.tagMenu")
        .expect("Tag group should exist");
    let settings = command_palette
        .find("t.command?.settings")
        .expect("Settings group should exist");

    assert!(
        tools < tags && tags < settings,
        "Command palette should render tag suggestions after tools and before settings"
    );
}

#[test]
fn add_entry_tag_suggestions_support_keyboard_selection() {
    let source = read_file("frontend/src/components/modals/AddEntryModal.tsx");

    assert!(
        source.contains("highlightedTagSuggestionIndex"),
        "AddEntryModal should track the highlighted tag suggestion"
    );
    assert!(
        source.contains("ArrowDown") && source.contains("ArrowUp"),
        "AddEntryModal tag input should support arrow-key suggestion navigation"
    );
    assert!(
        source.contains("aria-selected"),
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
fn ui_debug_mode_is_gated_and_traces_cmdk_event_flow() {
    let debug_log = read_file("frontend/src/lib/debugLog.ts");
    let ui_events = read_file("frontend/src/lib/uiEvents.ts");
    let header_actions =
        read_file("frontend/src/features/calendar/components/HeaderActionTrigger.tsx");
    let command_palette =
        read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");
    let modal_controller = read_file("frontend/src/context/ModalControllerContext.tsx");
    let calendar_page = read_file("frontend/src/features/calendar/CalendarPage.tsx");

    assert!(
        debug_log.contains("rbujo_debug_ui"),
        "Debug logging should be gated by a localStorage key"
    );
    assert!(
        ui_events.contains("debugLog") && ui_events.contains("listenerCount"),
        "uiEvents should trace event listener and emit state in debug mode"
    );
    assert!(
        header_actions.contains("OPEN_CMD_PALETTE")
            && header_actions.contains("debugLog"),
        "Header action buttons should log CmdK open attempts"
    );
    assert!(
        command_palette.contains("debugLog")
            && command_palette.contains("commandPaletteOpen"),
        "CmdK should log its controlled open state"
    );
    assert!(
        modal_controller.contains("commandPaletteOpen")
            && modal_controller.contains("OPEN_CMD_PALETTE"),
        "ModalController should own CmdK open state and the OPEN_CMD_PALETTE listener"
    );
    assert!(
        calendar_page.contains("debugLog") && calendar_page.contains("viewMode"),
        "CalendarPage should log view mode transitions for CmdK reproduction"
    );
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
fn archive_is_exposed_from_user_menu_only() {
    let user_menu = read_file("frontend/src/features/calendar/components/UserMenu.tsx");
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");
    let tauri_menu = read_file("src-tauri/src/lib.rs");

    assert!(
        user_menu.contains("navigate(\"/archive\")"),
        "User menu should navigate to archive"
    );
    assert!(
        !command_palette.contains("navigate(\"/archive\")"),
        "Command palette menu should not navigate to archive"
    );
    assert!(
        !tauri_menu.contains("menu:archive"),
        "macOS menu should not emit archive menu events"
    );
}
