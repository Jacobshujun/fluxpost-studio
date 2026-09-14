# Correct GPT Image 2.5 contract

- Restore 1:1, 4:3 and 3:4 when selecting 4K in Canvas and simple mode; changing resolution must preserve the selected ratio.
- Follow the supplied ToAPIs GPT Image 2.5 ordinary-model documentation for generation and reference requests: high quality, one output, ratio/tier, optional transparent background and URL references. Keep older-model requests scoped to their existing adapter contract.
- Pixel-based routes must receive dimensions satisfying the documented edge, area and multiple-of-16 limits, including 2880x2880 for square 4K.
- Verify requests offline, preserve accepted-task resume behavior, and run the full project baseline. No live provider calls or configuration changes.

Source read 2026-09-14: https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5/generation . The page explicitly documents 4K square 2880x2880, fixed high quality, n=1, reference_images with image_urls compatibility, and optional background=transparent. It does not document output_format/output_compression/response_format for ordinary 2.5.
