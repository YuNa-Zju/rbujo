use std::path::Path;

#[cfg(target_os = "macos")]
mod platform {
    use std::collections::HashSet;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};

    use base64::{Engine as _, engine::general_purpose};
    use objc2::runtime::Bool;
    use objc2_foundation::{
        NSData, NSURL, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions,
    };

    static ACTIVE_BOOKMARKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

    fn active_bookmarks() -> &'static Mutex<HashSet<String>> {
        ACTIVE_BOOKMARKS.get_or_init(|| Mutex::new(HashSet::new()))
    }

    pub fn create_bookmark(path: &Path) -> Result<Option<String>, String> {
        let url = NSURL::from_directory_path(path)
            .ok_or_else(|| "Failed to create macOS file URL for selected folder".to_string())?;
        let data = url
            .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
                NSURLBookmarkCreationOptions::WithSecurityScope,
                None,
                None,
            )
            .map_err(|error| format!("Failed to create macOS folder bookmark: {error:?}"))?;
        Ok(Some(general_purpose::STANDARD.encode(data.to_vec())))
    }

    pub fn restore_access(bookmark: &str) -> Result<bool, String> {
        {
            let active = active_bookmarks()
                .lock()
                .map_err(|_| "Failed to lock macOS bookmark state".to_string())?;
            if active.contains(bookmark) {
                return Ok(true);
            }
        }

        let bytes = general_purpose::STANDARD
            .decode(bookmark)
            .map_err(|error| format!("Invalid macOS folder bookmark: {error}"))?;
        let data = NSData::with_bytes(&bytes);
        let mut is_stale = Bool::NO;
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::WithSecurityScope,
                None,
                &mut is_stale,
            )
        }
        .map_err(|error| format!("Failed to resolve macOS folder bookmark: {error:?}"))?;

        let started = unsafe { url.startAccessingSecurityScopedResource() };
        if started {
            active_bookmarks()
                .lock()
                .map_err(|_| "Failed to lock macOS bookmark state".to_string())?
                .insert(bookmark.to_string());
        }
        Ok(started)
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use std::path::Path;

    pub fn create_bookmark(_path: &Path) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn restore_access(_bookmark: &str) -> Result<bool, String> {
        Ok(false)
    }
}

pub fn create_bookmark(path: &Path) -> Result<Option<String>, String> {
    platform::create_bookmark(path)
}

pub fn restore_access(bookmark: &str) -> Result<bool, String> {
    platform::restore_access(bookmark)
}
