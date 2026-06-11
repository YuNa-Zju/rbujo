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
        command_palette.contains("entry.tags"),
        "GlobalCommandPalette should include native tags in entry matching"
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
fn archive_is_not_exposed_from_app_menus() {
    let user_menu = read_file("frontend/src/features/calendar/components/UserMenu.tsx");
    let command_palette = read_file("frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx");
    let tauri_menu = read_file("src-tauri/src/lib.rs");

    assert!(
        !user_menu.contains("navigate(\"/archive\")"),
        "User menu should not navigate to archive"
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
