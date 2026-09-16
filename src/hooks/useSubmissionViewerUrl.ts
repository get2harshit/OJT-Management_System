import { useEffect, useState } from 'react';
import { apiGetPrdDownloadUrl } from '../lib/api';
import { submissionKindHasStoredFile, submissionKindOf } from '../lib/submissionDisplay';
import type { SubmissionKind } from '../lib/types';

/**
 * The signed URL the selected submission's file is previewed from — the PDF
 * viewer's src, or the video player's.
 *
 * Only document and video submissions have a stored file at all; for text and
 * link submissions this stays null and the detail pane renders their inline
 * content instead. The URL is short-lived by design (the backend signs it per
 * request), so it is re-fetched whenever the selection changes rather than
 * cached across submissions.
 *
 * Lives here rather than in each Submissions page because all three of them —
 * student, mentor, admin — need exactly this, and while it was copy-pasted per
 * page they drifted: see submissionKindHasStoredFile for what that cost.
 */
export function useSubmissionViewerUrl(
  submission?: { id: string; submissionType?: SubmissionKind } | null
): string | null {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Read off primitives, not the object: these pages rebuild the submission
  // row on every refetch, so depending on the object itself would re-sign a
  // URL on renders where nothing about the selection actually changed.
  const submissionId = submission?.id;
  const submissionKind = submissionKindOf(submission);

  useEffect(() => {
    if (!submissionId || !submissionKindHasStoredFile(submissionKind)) {
      setViewerUrl(null);
      return;
    }
    let cancelled = false;
    apiGetPrdDownloadUrl(submissionId)
      .then((url) => { if (!cancelled) setViewerUrl(url); })
      .catch(() => { if (!cancelled) setViewerUrl(null); });
    return () => { cancelled = true; };
  }, [submissionId, submissionKind]);

  return viewerUrl;
}
