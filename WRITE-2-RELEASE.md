# Syrka Write 2 — progressive delivery

## Foundation / formatting / assistance
- Retain Tiptap and existing file, cloud ownership and autosave models.
- Protect unknown nodes from destructive editing; no database conversion.
- Responsive ribbon tabs; font family/size, text colour, highlighting, superscript/subscript, six heading levels, paragraph spacing/indentation and RTL direction.
- A4/Letter/Legal, orientation, uniform custom margins, header/footer, page numbering in exports, zoom and explicit page breaks.
- DOCX/HTML/TXT import with confirmation and sanitisation. External HTML images are removed to avoid tracking requests. DOCX conversion does not preserve all original Word layout.
- Browser-native spelling and language configuration; local English suggestions; optional space-triggered common typo/pronoun correction with undo. No document text sent to external services.
- Structured academic sources, basic APA/MLA/Chicago/Harvard author–date strings and bibliography text. Not a full CSL engine; users must verify institution-specific rules.
- Eight blank academic structures, heading navigation, character/word/read-time statistics, ten named snapshots within each document.
- DOCX carries new text/paragraph/page attributes, running header/footer and page fields. PDF carries supported text size/colour/highlight, spacing, indentation and page settings.

## Explicit remaining limitations
Automatic pagination in the editable canvas, section/column layout, custom tab stops, full citation styles, linked cross-references, comments, comprehensive grammar, dedicated spelling dictionaries, user-defined autocorrect and smart quotes are not complete. The editable canvas is continuous within the chosen page width; explicit breaks are marked. PDF export paginates independently.

Programmatic PDF currently embeds Roboto and substitutes it for system fonts; Hindi/Urdu/Arabic shaping and complete font coverage are not guaranteed. Use browser print/Save as PDF for device font rendering. DOCX stores chosen font names with destination-device fallback; it does not embed proprietary fonts. Markdown/TXT necessarily lose visual formatting.

DOCX import uses Mammoth (BSD-2-Clause) and DOMPurify (Apache-2.0 OR MPL-2.0), with warnings. Unsupported imported fields, tracked changes, floating objects and exact page layout can be lost. Preserve the original import separately.
