# Write 2.0 architecture audit

The existing editor uses Tiptap 3 / ProseMirror, not execCommand. Retain it and its JSON tree. File kind `doc`, file IDs, ownership, and existing JSON content remain compatible. No database migration or destructive rewrite is needed.

Autosave is serialized and debounced in the existing hook. Editor updates feed the same file record; undo/redo remain ProseMirror transactions. Uploaded asset references are preserved while signed URLs are resolved for display. Export uses separate read-only conversions.

Before this upgrade: font family/size, highlighting, paragraph spacing/indentation, direction and page settings were absent from the schema; DOCX/PDF converters therefore could not preserve them. PDF used fixed A4 margins and Roboto. HTML and Markdown have format-specific loss. No DOCX import, automatic pagination, academic references, spelling dictionary or version history existed.

Compatibility safeguard: unknown document nodes are detected before mounting the editor and editing is blocked, allowing the existing download/backup menu to preserve the original. Supported older documents acquire default attributes only after editing. Import creates a preview in the editor and requires explicit replacement confirmation; never overwrites another library file.

Scope is progressive. Page dimensions, hard page breaks and print CSS are foundations, not a claim of automatic pagination or Word layout parity. Browser print retains system font shaping for multilingual text. Programmatic PDF font coverage remains limited until embedded multilingual fonts are supplied.
