# Diagnosis: Xiaopeng BBS rich-text collection

## Confirmed
- Operator clarified the target as the 2026-09-28 10:34 local run. Runtime candidate matches repository HEAD fec50a8d9169d8656ba0025c4aaad9377995a822.
- Read-only PostgreSQL inspection found directOriginalReference=true, one selected source-image task in keep mode, one saved output image, and no run errors. Logs confirm original-image persistence without an image-model call.
- The stored source contentText is the unresolved React Flight reference `$1f`. The current normalizer reproduces that result against the public source page.
- The referenced Flight text record contains a JSON rich-text insert array (1827 UTF-8 bytes in the observed page). The page has six inline image inserts plus one unique attachment image, seven unique images total. The attachment array repeats the same image twice; attachment deduplication itself is correct.
- src/lib/xiaopeng-bbs.ts:59 treats any nonempty content string as body, without resolving Flight text references or decoding rich-text inserts. Its image extractor at line 151 reads only attach and omits inline inserts.
- src/lib/openai.ts passes normalized source.contentText to the text model. Thus the real article never reaches rewriting; the output is a short title-derived sentence. Direct-original mode controls images, not text rewriting.

## Verification
- Live public page was fetched read-only. Current TypeScript normalizer was transpiled and executed with media/network dependencies stubbed; reproduced body reference and image count 1. Independently decoded the referenced text record using its hexadecimal UTF-8 byte length and counted six inline images/seven combined unique images.
- Documented offline baseline ran. Domain contracts, including Xiaopeng BBS import and source-content generation, passed; baseline stopped at existing lint errors (17 errors, 17 warnings). Type-check/build/smoke after lint were not reached in this diagnosis.
- Existing Xiaopeng test fixture covers direct text and attachment images, not Flight text references or JSON rich-text inline media.
- No application code, runtime records, generated outputs, publishing state, or listener was changed.

## Repair scope (not implemented)
Resolve referenced Flight text records with correct escaping/byte lengths, decode rich-text text/mentions/images preserving order, merge and deduplicate inline and attachment images, and reject unresolved references instead of treating them as content. Add isolated fixtures for these formats, then reimport and regenerate the affected item when authorized. No private source copy or media is stored in Trellis.
