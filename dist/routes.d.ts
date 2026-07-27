/**
 * Per-locator page context (routes).
 *
 * A spec suite rarely lives on one page: each test navigates somewhere with
 * page.goto(), and page objects hold locators for the route of whichever
 * specs import them. Probing every locator against the base URL homepage
 * makes locators on other routes look broken (or ambiguous against the
 * homepage's unrelated elements) — the exact failure this module removes.
 *
 * Route inference, per file:
 *   1. an explicit --route <file>=<route> override
 *   2. the file's own page.goto() calls: a locator uses the nearest goto
 *      above it, else the file's first goto (page-object constructors sit
 *      above the class's goto method)
 *   3. a page object with no goto inherits the routes of EVERY spec that
 *      imports it — its locators are probed on each of those routes
 *   4. otherwise the base URL itself
 * Relative routes are joined with the resolved base URL.
 */
export interface GotoCall {
    /** 1-indexed line of the .goto( call. */
    line: number;
    route: string;
}
export interface RouteOverride {
    /** Absolute path or path suffix (e.g. "pages/login-page.ts"). */
    file: string;
    route: string;
}
interface PlanFile {
    path: string;
    src: string;
}
export interface RoutePlanInput {
    files: PlanFile[];
    /** Spec path -> paths of every file gathered for that spec (spec first). */
    specFiles: Map<string, string[]>;
    overrides?: RouteOverride[];
    /** Resolved absolute base URL; relative routes join against it. */
    baseUrl: string;
}
export interface RoutePlan {
    gotosByFile: Map<string, GotoCall[]>;
    overrideByFile: Map<string, string>;
    /** File path -> routes inherited from importing specs (POMs without gotos). */
    inheritedByFile: Map<string, string[]>;
    baseUrl: string;
}
/**
 * Every page.goto() in a file, in order. A literal argument is taken as-is;
 * an identifier argument (goto(this.url)) resolves against the first `url`
 * string property in the same file, the common page-object shape.
 */
export declare function parseGotos(src: string): GotoCall[];
/** Route governing a locator at `line`: nearest goto above, else the first. */
export declare function routeForLine(gotos: GotoCall[], line: number): string | null;
/**
 * Strip trailing auto-generated-looking words (bare numbers, hex blobs)
 * from an intent token, so "#Email_1" can retry as "Email" after "Email 1"
 * finds nothing. Returns null when nothing was stripped, or when stripping
 * would leave nothing distinctive.
 */
export declare function stripAutoSuffixes(token: string): string | null;
export declare function buildRoutePlan(input: RoutePlanInput): RoutePlan;
/** Join a route (possibly relative) with the plan's base URL. */
export declare function resolveRoute(baseUrl: string, route: string): string;
/** Resolved absolute URLs a locator at file:line must be probed on. */
export declare function routesForLocator(plan: RoutePlan, filePath: string, line: number): string[];
/**
 * True when the locator's file has a REAL route signal — an override, its
 * own goto, or routes inherited from importing specs — as opposed to the
 * bare base-URL fallback, which is a guess about where the element lives.
 */
export declare function hasExplicitRoute(plan: RoutePlan, filePath: string, line: number): boolean;
/** Human-readable route for refusal messages: the path part of the URL. */
export declare function routeLabel(url: string): string;
export {};
