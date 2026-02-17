# Chat Intelligence Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the chat interface to recognize specific app names (like "Chrome") in user requests and deploy only that app instead of showing all available apps.

**Architecture:** Add an `aliases` array to each app in the APP_CATALOG constant, then enhance the `findApp()` function to check both the app's full name and its aliases when matching user input.

**Tech Stack:** React 19, Vite, JavaScript (no TypeScript)

---

## Task 1: Add Aliases to APP_CATALOG

**Files:**
- Modify: `frontend/src/App.jsx:9-20` (APP_CATALOG definition)

**Step 1: Locate APP_CATALOG constant**

The APP_CATALOG is defined around lines 9-20 in App.jsx. It currently contains 10 apps without aliases.

**Step 2: Add aliases property to each app**

Update each app object to include an `aliases` array with common name variations:

```javascript
const APP_CATALOG = [
  {
    name: "Google Chrome",
    wingetId: "Google.Chrome",
    type: "Win32",
    size: "120 MB",
    aliases: ["chrome", "google chrome"]
  },
  {
    name: "Mozilla Firefox",
    wingetId: "Mozilla.Firefox",
    type: "Win32",
    size: "95 MB",
    aliases: ["firefox", "mozilla firefox"]
  },
  {
    name: "Zoom Workplace",
    wingetId: "Zoom.Zoom",
    type: "Store",
    size: "45 MB",
    aliases: ["zoom", "zoom workplace"]
  },
  {
    name: "Slack",
    wingetId: "SlackTechnologies.Slack",
    type: "Store",
    size: "78 MB",
    aliases: ["slack"]
  },
  {
    name: "Adobe Acrobat Reader",
    wingetId: "Adobe.Acrobat.Reader.64-bit",
    type: "Win32",
    size: "210 MB",
    aliases: ["acrobat", "adobe reader", "pdf reader", "adobe acrobat"]
  },
  {
    name: "Microsoft Teams",
    wingetId: "Microsoft.Teams",
    type: "M365",
    size: "Bundled",
    aliases: ["teams", "microsoft teams"]
  },
  {
    name: "7-Zip",
    wingetId: "7zip.7zip",
    type: "Win32",
    size: "5 MB",
    aliases: ["7zip", "7-zip", "zip"]
  },
  {
    name: "Visual Studio Code",
    wingetId: "Microsoft.VisualStudioCode",
    type: "Win32",
    size: "95 MB",
    aliases: ["vscode", "vs code", "code", "visual studio code"]
  },
  {
    name: "Notepad++",
    wingetId: "Notepad++.Notepad++",
    type: "Win32",
    size: "12 MB",
    aliases: ["notepad++", "notepad", "npp"]
  },
  {
    name: "VLC Media Player",
    wingetId: "VideoLAN.VLC",
    type: "Win32",
    size: "42 MB",
    aliases: ["vlc", "vlc player", "vlc media player"]
  },
];
```

**Step 3: Verify syntax**

Check that:
- All objects have proper comma separation
- Aliases are lowercase for consistent matching
- No duplicate aliases across apps

**Step 4: Save the changes**

Save `frontend/src/App.jsx` after adding aliases to all 10 apps.

---

## Task 2: Update findApp() Function

**Files:**
- Modify: `frontend/src/App.jsx:58-61` (findApp function)

**Step 1: Locate the findApp() function**

Current implementation (lines 58-61):

```javascript
function findApp(msg) {
  const lower = msg.toLowerCase();
  return APP_CATALOG.find(a => lower.includes(a.name.toLowerCase()));
}
```

**Step 2: Replace with enhanced version**

Replace the function with alias-aware matching:

```javascript
function findApp(msg) {
  const lower = msg.toLowerCase();
  return APP_CATALOG.find(a => {
    // Check if message contains the full app name
    if (lower.includes(a.name.toLowerCase())) return true;
    // Check if message contains any of the app's aliases
    if (a.aliases && a.aliases.length > 0) {
      return a.aliases.some(alias => lower.includes(alias.toLowerCase()));
    }
    return false;
  });
}
```

**Step 3: Review the logic**

The function now:
1. Converts user message to lowercase
2. Searches APP_CATALOG for first app where either:
   - The app's full name appears in the message, OR
   - Any of the app's aliases appear in the message
3. Returns the matched app object (or undefined if no match)

**Step 4: Save the changes**

Save `frontend/src/App.jsx` after updating the findApp() function.

---

## Task 3: Manual Testing in Browser

**Files:**
- Test: `frontend/src/App.jsx` (via browser)

**Step 1: Ensure dev server is running**

If not already running:
```bash
cd frontend
npm run dev
```

Expected: Server starts on http://localhost:3000/

**Step 2: Test specific app recognition**

In the chat interface, type each test case and verify behavior:

| Test Input | Expected Behavior |
|------------|-------------------|
| "Deploy Chrome" | Shows device selector for **Google Chrome only** |
| "Install Firefox on Marketing" | Shows device selector for **Mozilla Firefox only** |
| "Push Teams to all devices" | Shows device selector for **Microsoft Teams only** |
| "Deploy VLC" | Shows device selector for **VLC Media Player only** |
| "Install VS Code" | Shows device selector for **Visual Studio Code only** |

**Step 3: Test generic requests (fallback behavior)**

| Test Input | Expected Behavior |
|------------|-------------------|
| "Deploy app" | Shows grid of **all available apps** |
| "Install software" | Shows grid of **all available apps** |
| "Deploy something" | Shows grid of **all available apps** |

**Step 4: Test edge cases**

| Test Input | Expected Behavior |
|------------|-------------------|
| "Deploy chrome and firefox" | Matches **Google Chrome** (first match wins) |
| "Install CHROME" | Matches **Google Chrome** (case insensitive) |
| "deploy   chrome  " | Matches **Google Chrome** (whitespace handled) |

**Step 5: Document any issues**

If any test fails:
- Note the exact input that failed
- Note the expected vs actual behavior
- Check for typos in aliases or function logic

---

## Task 4: Verification and Commit

**Files:**
- Modified: `frontend/src/App.jsx`

**Step 1: Verify all tests passed**

Confirm that:
- ✅ Specific app names are recognized correctly
- ✅ Generic requests still show all apps
- ✅ Case insensitivity works
- ✅ No errors in browser console

**Step 2: Review code changes**

Quick self-review:
- Aliases are comprehensive and lowercase
- findApp() logic is correct
- No syntax errors
- Code is clean and readable

**Step 3: Stage changes**

```bash
cd "/Users/jakubskubisz/Desktop/Senior Project"
git add frontend/src/App.jsx
```

**Step 4: Commit with descriptive message**

```bash
git commit -m "$(cat <<'EOF'
feat: improve chat app detection with aliases

Add aliases to APP_CATALOG for common app name variations
(e.g., "Chrome" for "Google Chrome"). Update findApp() to
check both full names and aliases.

Users can now type natural requests like "Deploy Chrome"
instead of needing the full "Google Chrome" name.

Testing:
- "Deploy Chrome" → correctly matches Google Chrome
- "Install Firefox" → correctly matches Mozilla Firefox
- "Deploy app" → still shows all apps (fallback)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

Expected: Commit successful with message confirming 1 file changed.

---

## Completion Checklist

- [ ] Task 1: Aliases added to all 10 apps in APP_CATALOG
- [ ] Task 2: findApp() function updated with alias matching
- [ ] Task 3: Manual testing confirms specific apps are recognized
- [ ] Task 4: Changes committed to git

## Notes

- This implementation uses a simple "first match wins" strategy
- If a user mentions multiple apps, only the first detected app is matched
- Future enhancement: Support multi-app deployment in a single request
- Future enhancement: Add fuzzy matching for typo tolerance

## Rollback Plan

If issues arise:
```bash
git revert HEAD
```

This will undo the changes and restore the previous behavior where only exact full names worked.
