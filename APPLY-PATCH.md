# Apply frontend modernisation patch

## Apply the patch

From the project root (the folder that contains `frontend/`):

```bash
git apply frontend-modern.patch
```

If you're not using git:

```bash
patch -p1 < frontend-modern.patch
```

(If paths don’t match, try `patch -p0 < frontend-modern.patch`.)

## Optional: finish accent colour changes

If any deploy/update cards or “Target:” labels still use blue/purple, do a find-replace in `frontend/src/App.jsx`:

- **Find:** `gradient="#2563eb, #3b82f6"` → **Replace:** `gradient="#a67c00, #c9a227"`
- **Find:** `gradient="#7c3aed, #8b5cf6"` → **Replace:** `gradient="#a67c00, #c9a227"`
- **Find:** `color: "#60a5fa"` (in meta spans / InfoBox) → **Replace:** `color: "#d4a574"`

Then run the app and check the UI.
