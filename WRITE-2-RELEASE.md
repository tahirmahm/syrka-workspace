# Syrka Write 2 — progressive delivery

## Delivered in this release

### Architecture and safety
Tiptap 3 / ProseMirror is retained. Existing `doc` JSON trees, file IDs, owner policies, storage references and autosave remain compatible. There is no database migration. Unknown node types block editing with an editable-backup download available. Imported content requires confirmation before replacement and remains undoable. Pasted/imported HTML is sanitised; remote images are replaced with notices to prevent tracking requests.

Write drafts are recoverable on the same browser for seven days. A newer interrupted draft requires an explicit restore/discard decision before mounting the editor. Drafts are keyed by owner and file ID and removed after a successful latest save. Browser storage availability/quota applies. Ten named snapshots can be saved within a document and restored through Review; these travel with the same owner-protected file.

### Formatting
Responsive Home, Insert, Layout, References and Review panels retain Workspace styling. Fonts, sizes, text colours, highlights, superscript/subscript, formatting copy/apply, six heading levels, nested lists, paragraph indentation/spacing/shading, RTL/LTR direction and clear formatting are functional. Normal, Title, Subtitle, Quote, Caption, Code and Bibliography presets can be updated from a selection and reused. Heading styles 1–6 remain available separately.

Tables support resizing, rows/columns, delete, merge/split and cell shading. Images support resize, width controls, centering, left/right wrapping in the browser and captions. Exports preserve supported image dimensions; DOCX/PDF use in-flow images rather than exact browser float wrapping.

### Layout and PDF
A4, Letter and Legal; portrait/landscape; uniform custom margins; headers/footers; page numbers; explicit page breaks; zoom. Paged.js produces a local automatic multi-page print preview with running headers/footers and footnotes. The source editor remains a continuous canvas at the chosen page width with hard-break markers; it is not live page-by-page editing.

Downloadable vector PDF preserves supported rich text, size/colour/highlight, superscript/subscript, alignment, spacing, indentation, merged tables, image sizing, page settings and running headers/footers. It embeds freely redistributable Noto Sans/Serif/Mono (Latin, Greek and Cyrillic coverage). System fonts are substituted with the corresponding Noto family; Mono italic uses upright glyphs. Font licence/provenance is in `public/fonts/`. Use Print → Print / Save PDF for device-specific fonts and complex Hindi/Urdu/Arabic shaping. Programmatic PDF is a separate layout engine and will not match browser pagination exactly. Its footnotes appear as endnotes.

### Interoperability
Import DOCX, HTML and TXT. Mammoth provides DOCX structure; a supplemental metadata transform preserves supported direct run font/size/highlight, paragraph alignment and left indentation. Supported headings, lists, tables, images, links and inline emphasis are retained. Inherited Word styles, exact section/page layout, fields, tracked changes and floating objects may be lost; the original import must be preserved separately.

Export editable DOCX, PDF, HTML, Markdown and TXT, plus Syrka JSON backup. DOCX carries text formatting, paragraph presets, page settings, header/footer/page fields, image sizing, tables and native footnotes. PDF/text/Markdown have their documented format-specific limits. HTML preserves supported inline/paragraph formatting, image dimensions, page settings and note text. Named snapshots, source records and live document behaviour require the Syrka backup. No full Microsoft Word compatibility claim.

### Writing and academics
Browser-native spelling and document language (UK/US English, Hindi, Urdu, Arabic, French, German). Browser/context-menu dictionary capabilities vary by device. Local conservative English spelling/grammar suggestions have accept, ignore-once and ignore-all actions. Optional space-triggered typo/pronoun autocorrection, custom word replacements and smart double quotes participate in undo. English rules are disabled for non-English documents and avoid code/link marks. These are rules, not comprehensive AI analysis; no document text leaves the browser for checking.

Eight blank academic structures; structured source records; basic APA/MLA/Chicago/Harvard author–date citations and bibliography text. These are not complete CSL style implementations—verify institutional rules. Footnotes can be inserted, edited, deleted and automatically renumbered. Outline navigation, automatic heading numbering and static contents snapshots are available. Contents snapshots and inserted citation/bibliography text do not update automatically. Word/character/read-time statistics; find-next, replace-first/all.

## Still unavailable
Live paginated editing, per-side margins/sections/columns/tab stops, editable custom Heading 1–6 style definitions, full CSL bibliographies, linked cross-references, dedicated endnotes, comments, equation objects, automatic image captions/cross-references, exhaustive grammar and an application-owned spelling dictionary. English sentence capitalization and punctuation are offered as suggestions rather than silently rewritten. Advanced controls are omitted.

## Validation
Unit tests cover compatible legacy defaults, unknown node protection, page settings, local language rules and structured academic data. Browser tests cover existing Workspace/Tools/auth/export functionality plus new formatting persistence, undo/language behaviour, named versions, recovery, DOCX import/re-export, paginated long essays and six representative fixtures. DOCX ZIP/XML and PDFs/spreadsheets/images are validated with format-aware parsers. Reader’s Diary preview and the actual downloaded PDF rendered back to PNG have reviewed screenshot baselines. Desktop Microsoft Word/LibreOffice manual testing has not been performed in this environment.
