# Continue preview after image deletion

- Successful deletion in an open preview selects the next image in the loaded gallery; deleting its last image selects the previous image. Only an empty gallery closes the preview.
- Preserve loaded pages and the current cursor rather than reloading page one after each deletion.
- Deleting the last loaded image while another cursor page exists loads that page and continues there; a page-fetch failure still removes the successfully deleted asset and reports the refresh failure explicitly.
- Keep preview identity stable by asset ID. Continuous keyboard deletion must target the newly displayed image.
- Preserve confirmation, busy/permission guards, failure behavior, counts, selection and deleted detail cleanup.
- Verify middle/last/only-image deletion, repeated keyboard deletion and deletion beyond the first page with mocked desktop/mobile browser checks, plus the full offline baseline.

Scope: library page, existing browser check and Trellis task/status only. No backend changes or real asset deletions.
