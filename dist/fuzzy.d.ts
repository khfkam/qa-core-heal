/**
 * Fuzzy identifier matching for typo'd selectors.
 *
 * "#Emai_l" never matches "#Email" through the semantic ladder: its tokens
 * ("Emai", "l") are not words the page knows. But normalized to bare
 * lowercase alphanumerics the two identifiers are an edit apart, and that
 * is measurable. This module scores candidate identifiers (ids, name
 * attributes, accessible-name sources) against the broken one by
 * edit-distance ratio.
 *
 * Fuzzy sits BELOW exact and suffix-stripped matching: it only runs after
 * both have failed, and its verdicts stay refusal-first —
 *   exactly one candidate at or above the heal threshold  → heal candidate
 *     (still subject to the kind guard and same-element confirmation)
 *   two or more candidates in the band                     → ambiguous
 *   best candidate below the threshold but above the floor → near-miss,
 *     named in the refusal so the user sees what was considered
 *   nothing above the floor                                → none
 */
/** Similarity at or above this heals (tuned against the eval harness). */
export declare const FUZZY_HEAL_THRESHOLD = 0.8;
/** Similarity at or above this is worth naming in a refusal. */
export declare const FUZZY_NEAR_MISS_FLOOR = 0.5;
/** Lowercase alphanumerics only: "Emai_l" → "email", "Email:" → "email". */
export declare function normalizeIdentifier(s: string): string;
/**
 * Render-random identifiers carry NO identity: React useId patterns
 * (":r1a:", "_r_17_-form-item") and values whose every word is a bare
 * number or hash. They contribute nothing to matching, and naming one as
 * a "closest candidate" is noise — it changes every render.
 */
export declare function isGeneratedIdentifier(v: string): boolean;
/**
 * Selector-SHAPED strings observed as page text. Documentation pages
 * (uitestingplayground's /classattr, tutorial sites) display XPath and
 * CSS selectors as code samples; a selector names how to FIND an element,
 * not what an element is — never a candidate, never a match, never named
 * in a refusal.
 */
export declare function isSelectorLikeText(v: string): boolean;
/** Edit-distance ratio in [0, 1] over the normalized forms. */
export declare function similarity(a: string, b: string): number;
export interface FuzzyCandidate {
    /** How the element is shown in messages: "#id", '[name="..."]', or the value. */
    display: string;
    /** Identifier strings the element carries (id, name, aria-label, label text...). */
    values: string[];
    /** value -> attribute kind it came from (id, name, aria-label, label, text...). */
    attrOf?: Record<string, string>;
}
export type FuzzyVerdict = {
    kind: 'match';
    candidate: FuzzyCandidate;
    value: string;
    score: number;
} | {
    kind: 'ambiguous';
    displays: string[];
} | {
    kind: 'near-miss';
    closest: Array<{
        display: string;
        score: number;
    }>;
} | {
    kind: 'none';
};
/**
 * Score every candidate's best value against the broken identifier and
 * apply the band rules above. Short tokens (normalized length < 4) carry
 * too little signal for edit distance: they match only at similarity 1
 * (i.e. differing in case/separators alone) and never near-miss.
 *
 * Per value, the score is the better of whole-string edit distance and
 * token containment; render-random values (React useId ids, hashes) score
 * ZERO and are excluded from near-miss naming unless nothing else exists.
 */
export declare function matchFuzzy(source: string, candidates: FuzzyCandidate[]): FuzzyVerdict;
