/**
 * Element-kind guard.
 *
 * A broken selector usually still says what KIND of element it meant:
 * "#register-button" is a button, ".terms-link" is a link, a locator that
 * gets .fill()ed is a text input, one that gets .check()ed is a checkbox.
 * When re-resolution lands on an element whose actual kind conflicts with
 * that expectation, the heal is wrong no matter how well the name matched —
 * the real-world case is a submit button "healed" to a same-named nav link.
 * The guard turns that into a refusal; refusing is correct, guessing is not.
 */
export type ElementKind = 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox';
/**
 * Kinds implied by the words inside a selector (id, class, attribute values,
 * tag names). Splits on separators and camelCase so "#submitBtn" and
 * "#digest-checkbox-52ba17" both yield their keyword.
 */
export declare function kindsFromTokens(selectorText: string): ElementKind[];
/**
 * Kinds implied by the API chained onto the locator at its call site.
 * .fill() only works on text inputs, .check() on checkables, .selectOption()
 * on selects. .click() implies nothing — anything is clickable.
 */
export declare function kindsFromTrailingApi(trailing: string): ElementKind[];
export interface ElementInfo {
    tag: string;
    type: string | null;
    role: string | null;
    href: boolean;
}
/** The candidate element's actual kind; null when it has no clear kind. */
export declare function kindOfElement(info: ElementInfo): ElementKind | null;
/**
 * True only on a DEFINITE mismatch: something was expected, the candidate's
 * kind is known, and they disagree. No expectation or an unknown candidate
 * kind never conflicts — the guard refuses wrong heals, it does not invent
 * new reasons to block plausible ones.
 */
export declare function kindConflict(expected: ElementKind[], actual: ElementKind | null): boolean;
