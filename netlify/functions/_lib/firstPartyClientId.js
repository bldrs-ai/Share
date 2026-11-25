/*
 * The GA client id every first-party, cookieless report is sent under:
 * model-open-count (one per model load) and page-visit (one per page load).
 * One id for both, so GA adds no "users" and no report is tied to a browser;
 * the page session id (`session_id`, in page memory only) is what joins a
 * visit to its loads (design/new/model-open-counts.md).
 *
 * In GA's web client-id shape, `<uint32>.<uint32>`, because GA answers 2xx to
 * a malformed id yet may not process the event (client-capabilities.js
 * #CAPABILITY_CLIENT_ID). The first eight bytes of
 * SHA-256('bldrs-share:model-open-count'), written out so the replays can
 * match it exactly. Kept as that string's digest when page-visit joined, so
 * the model-open stream's id didn't change.
 */
export const FIRST_PARTY_CLIENT_ID = '3587090903.711617492'
