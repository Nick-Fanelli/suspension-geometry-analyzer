/**
 * Suspension Kinematics Solver — TypeScript port
 *
 * Ported from a Python/NumPy/SciPy implementation. Plotting (matplotlib) is not
 * part of the numerical core and has been omitted; `console.log` stands in for
 * the original `print()` calls and timing diagnostics.
 *
 * Notes on fidelity to the original:
 *  - `roll_ang` uses `sin(z / y)` exactly as the source did (not `asin`), even
 *    though that looks like it should be an arcsine. Preserved as-is.
 *  - In the roll-center section, `opp_ic_r` is assigned as the *same array
 *    reference* as `opp_ic` in the original Python (list aliasing), so calling
 *    `.reverse()` on it also reverses `opp_ic` in place. That aliasing/mutation
 *    behavior is reproduced here on purpose.
 *  - `intersection_sphere_circle` returns `undefined` (Python: implicit `None`)
 *    when the geometry doesn't intersect, matching the original's early
 *    `return` with no value after printing diagnostics.
 *  - `linkforce` builds one 6x6 (per-sample) linear system per suspension
 *    sample instead of one giant block-diagonal sparse matrix. Because the
 *    original matrix is block-diagonal (each 6x6 block is independent), this
 *    is mathematically equivalent to `scipy.sparse.linalg.spsolve` on the full
 *    matrix, just solved block-by-block with a small dense Gaussian
 *    elimination routine instead of a sparse solver. The original Python
 *    method computed `x` but never stored or returned it; here the per-sample
 *    solutions are collected and returned, which seems to be the obvious
 *    intent, but is a slight extension beyond the literal original.
 *
 * Fix applied in this revision:
 *  - The original travel-sampling loops (lower/upper wishbone outboard point,
 *    tie rod outer point, wheel center, push-rod outboard point, push-rod
 *    inboard/rocker point) used `if (!result) continue;` whenever
 *    `intersectionSphereCircle` failed to find a valid intersection (which
 *    happens whenever the requested travel step falls outside what the
 *    physical linkage geometry can actually reach). Skipping the sample
 *    caused each `.hist` array to end up a *different, shorter* length than
 *    its neighbors, and — worse — shorter than `2 * steps + 1`, which every
 *    downstream calculation (bump steer, camber/caster gain, roll center,
 *    rocker angle, motion ratio) assumes. That misalignment eventually caused
 *    an out-of-bounds `undefined` array access and crashed with
 *    "Cannot read properties of undefined (reading '0')" inside `sub()`.
 *
 *    Every sampling loop below now *holds the last valid position* instead of
 *    skipping when a sample is geometrically unreachable (i.e. the linkage
 *    has hit its physical limit of travel). This guarantees every `.hist`
 *    array always has exactly `2 * steps + 1` entries in 1:1 correspondence
 *    with the sample index, eliminating the crash. A `console.warn` is
 *    emitted (once per affected sample) so out-of-range travel requests are
 *    still visible for diagnosis — you may want to reduce `fullJounce`/
 *    `fullRebound` or `steps` if you see many of these.
 */

// ---------------------------------------------------------------------------
// Basic vector types & math helpers
// ---------------------------------------------------------------------------

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec = number[];

/** Zip two arrays together (like Python's zip, truncating to the shorter). */
function zip2<A, B>(a: A[], b: B[]): Array<[A, B]> {
    const n = Math.min(a.length, b.length);
    const out: Array<[A, B]> = [];
    for (let i = 0; i < n; i++) out.push([a[i], b[i]]);
    return out;
}

function zip3<A, B, C>(a: A[], b: B[], c: C[]): Array<[A, B, C]> {
    const n = Math.min(a.length, b.length, c.length);
    const out: Array<[A, B, C]> = [];
    for (let i = 0; i < n; i++) out.push([a[i], b[i], c[i]]);
    return out;
}

function zip4<A, B, C, D>(a: A[], b: B[], c: C[], d: D[]): Array<[A, B, C, D]> {
    const n = Math.min(a.length, b.length, c.length, d.length);
    const out: Array<[A, B, C, D]> = [];
    for (let i = 0; i < n; i++) out.push([a[i], b[i], c[i], d[i]]);
    return out;
}

function sub(a: Vec, b: Vec): Vec {
    return a.map((v, i) => v - b[i]);
}

function add(a: Vec, b: Vec): Vec {
    return a.map((v, i) => v + b[i]);
}

function scale(a: Vec, s: number): Vec {
    return a.map((v) => v * s);
}

function dot(a: Vec, b: Vec): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function norm(a: Vec): number {
    return Math.sqrt(dot(a, a));
}

function normalize(a: Vec): Vec {
    const n = norm(a);
    if (n < 1e-12) {
        // A zero-length vector has no direction. Rather than dividing by zero
        // (which silently produces NaN and poisons every downstream value
        // that touches it), fall back to a zero vector and note it happened.
        console.warn("normalize() called on a near-zero-length vector; returning zero vector.");
        return a.map(() => 0);
    }
    return a.map((v) => v / n);
}

function signNum(x: number): number {
    return Math.sign(x);
}

// ---------------------------------------------------------------------------
// Geometry helper functions (direct ports)
// ---------------------------------------------------------------------------

/**
 * Angle between two vectors (degrees). Arccos of the dot product of unit
 * vectors. Works for vectors of any (equal) length.
 */
export function angle(v1: Vec, v2: Vec): number {
    const uv1 = normalize(v1);
    const uv2 = normalize(v2);
    const dot12 = dot(uv1, uv2);
    // Clamp for numerical safety (NumPy's arccos would return NaN on tiny
    // overshoot past +/-1 from floating point error; Python code did not clamp,
    // but we guard here since JS Math.acos also returns NaN in that case).
    const clamped = Math.min(1, Math.max(-1, dot12));
    return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Shortest vector between a point and a line defined by points `a` and `b`.
 * This vector is perpendicular to line ab. Used for geometric steering arm
 * and roll center calculations. Works for 2D or 3D points.
 */
export function ptToLn(pt: Vec, a: Vec, b: Vec): Vec {
    const lnAb = sub(a, b);
    const lnAp = sub(a, pt);
    const abU = normalize(lnAb);
    const proj = scale(abU, dot(lnAp, abU));
    return sub(lnAp, proj);
}

/**
 * Perpendicular vector for a 2-vector, using rule (y,-x) _|_ (x,y).
 */
export function perp(a: Vec2): Vec2 {
    return [-a[1], a[0]];
}

/**
 * Intersection point of 2D line A (a1->a2) and line B (b1->b2).
 */
export function segIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 {
    const da: Vec2 = [a2[0] - a1[0], a2[1] - a1[1]];
    const db: Vec2 = [b2[0] - b1[0], b2[1] - b1[1]];
    const dp: Vec2 = [a1[0] - b1[0], a1[1] - b1[1]];
    const dap = perp(da);
    let denom = dot(dap, db);
    if (Math.abs(denom) < 1e-9) {
        // The two lines are (numerically) parallel. Dividing by exactly zero
        // here would produce Infinity or NaN (0/0) and poison every
        // downstream value that depends on this point — e.g. roll center Y/Z.
        // A parallel instant-center pair is a real, if rare, suspension
        // condition (roll center effectively at infinity); nudge the
        // denominator away from zero so we get a very large but finite point
        // instead of crashing the whole curve.
        denom = denom < 0 ? -1e-9 : 1e-9;
    }
    const num = dot(dap, dp);
    const factor = num / denom;
    return [factor * db[0] + b1[0], factor * db[1] + b1[1]];
}

/**
 * Intersection of two spheres, given a known point on the circle of
 * intersection. Returns [normal, center, radius] of that circle.
 */
export function intersectionOfSpheres(
    center1: Vec3,
    center2: Vec3,
    intersectionPt: Vec3
): [Vec3, Vec3, number] {
    const d = norm(sub(center2, center1));
    const r1 = norm(sub(center1, intersectionPt));
    const r2 = norm(sub(center2, intersectionPt));
    const h = 0.5 + (r1 * r1 - r2 * r2) / (2 * d * d);

    // Clamp: floating-point rounding can push this radicand slightly below
    // zero even for genuinely valid geometry, which would otherwise turn
    // into NaN here and silently poison everything downstream.
    const rI = Math.sqrt(Math.max(0, r1 * r1 - h * h * d * d));
    const nI = scale(sub(center2, center1), 1 / d) as Vec3;
    const cI = add(center1, scale(sub(center2, center1), h)) as Vec3;

    return [nI, cI, rI];
}

/**
 * Intersection of two spheres, given the radii to the circle of intersection
 * (rather than a known point). Returns [normal, center, radius].
 */
export function intersectionOfSpheresRadii(
    center1: Vec3,
    center2: Vec3,
    r1: number,
    r2: number
): [Vec3, Vec3, number] {
    const d = norm(sub(center2, center1));
    const h = 0.5 + (r1 * r1 - r2 * r2) / (2 * d * d);

    // Clamp for the same reason as intersectionOfSpheres above.
    const rI = Math.sqrt(Math.max(0, r1 * r1 - h * h * d * d));
    const nI = scale(sub(center2, center1), 1 / d) as Vec3;
    const cI = add(center1, scale(sub(center2, center1), h)) as Vec3;

    return [nI, cI, rI];
}

/**
 * Intersection of a sphere (center cS, radius rS) with a circle (normal nI,
 * center cI, radius rI). Returns the two intersection points, or undefined if
 * there is no valid intersection (mirrors the original's early `return` with
 * diagnostic prints).
 */
export function intersectionSphereCircle(
    cS: Vec3,
    rS: number,
    nI: Vec3,
    cI: Vec3,
    rI: number
): [Vec3, Vec3] | undefined {
    // Small relative tolerance so geometry that is only *barely* failing a
    // strict inequality due to floating-point rounding (extremely common
    // right at the physical limit of suspension travel, where the sphere and
    // circle are nearly exactly tangent) is still accepted instead of
    // rejected outright.
    const REL_TOL = 1e-3;

    const dp = dot(nI, sub(cI, cS)); // distance of plane to sphere center
    const cP = add(cS, scale(nI, dp)) as Vec3; // center of circle = sphere cut by plane

    if (Math.abs(dp) > rS * (1 + REL_TOL)) {
        console.log("distance between centers:", Math.abs(dp));
        console.log("radius of sphere:", rS);
        console.log("ruh roh, sphere does not intersect circle");
        return undefined;
    }
    // Clamp: dp can be marginally larger than rS due to rounding even when
    // the tolerance check above passes, which would otherwise make this sqrt
    // negative -> NaN.
    const rP = Math.sqrt(Math.max(0, rS * rS - dp * dp)); // radius of that circle

    const d = norm(sub(cP, cI)); // distance between centers
    if (d > (rI + rP) * (1 + REL_TOL)) {
        console.log("ruh roh, circles do not intersect?");
        return undefined;
    }
    if (d + Math.min(rI, rP) < Math.max(rI, rP) * (1 - REL_TOL)) {
        console.log("ruh roh, one circle is inside the other");
        return undefined;
    }
    if (d < 1e-9) {
        // Coincident circle centers — the line between them (used below to
        // build the intersection axis) has no defined direction.
        console.log("ruh roh, circle centers coincide");
        return undefined;
    }

    const h = 0.5 + (rI * rI - rP * rP) / (2 * d * d); // ratio of circle sizes
    const rJ = Math.sqrt(Math.max(0, rI * rI - h * h * d * d)); // distance from center line
    const cJ = add(cI, scale(sub(cP, cI), h)) as Vec3; // point along center line

    const crossVec = cross3(sub(cP, cI) as Vec3, nI);
    const crossNorm = norm(crossVec);
    if (crossNorm < 1e-9) {
        // The circle's plane normal is parallel to the line joining the two
        // centers — there's no well-defined direction to place the two
        // intersection points along.
        console.log("ruh roh, circle normal is parallel to the center line");
        return undefined;
    }
    const t = scale(crossVec, 1 / crossNorm) as Vec3;

    const p0 = sub(cJ, scale(t, rJ)) as Vec3;
    const p1 = add(cJ, scale(t, rJ)) as Vec3;

    if (!p0.every(Number.isFinite) || !p1.every(Number.isFinite)) {
        // Belt-and-braces: if anything upstream still produced a non-finite
        // value despite the guards above, treat it as "no intersection"
        // rather than handing back a point containing NaN/Infinity — every
        // caller in KinSolve.solve() already knows how to fall back to the
        // last valid position when this function returns undefined.
        console.log("ruh roh, intersection produced a non-finite point");
        return undefined;
    }

    return [p0, p1];
}

// ---------------------------------------------------------------------------
// Point (tracks travel history for a moving suspension point)
// ---------------------------------------------------------------------------

export class Point {
    /** Total travel history. */
    hist: Vec3[] = [];
    /** Static origin position. */
    origin: Vec3;

    constructor(coords: Vec3) {
        this.origin = [...coords] as Vec3;
    }
}

// ---------------------------------------------------------------------------
// Small dense linear solver (Gaussian elimination with partial pivoting)
// Stands in for scipy.sparse.linalg.spsolve on a single 6x6 block.
// ---------------------------------------------------------------------------

function solveLinearSystem(aIn: number[][], bIn: number[]): number[] {
    const n = bIn.length;
    const a = aIn.map((row) => row.slice());
    const b = bIn.slice();

    for (let col = 0; col < n; col++) {
        // Partial pivot
        let pivotRow = col;
        let maxVal = Math.abs(a[col][col]);
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(a[r][col]) > maxVal) {
                maxVal = Math.abs(a[r][col]);
                pivotRow = r;
            }
        }
        if (pivotRow !== col) {
            [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
            [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
        }

        const pivot = a[col][col];
        if (Math.abs(pivot) < 1e-14) {
            // Singular (or near-singular) — leave as zero contribution.
            continue;
        }

        for (let r = col + 1; r < n; r++) {
            const factor = a[r][col] / pivot;
            if (factor === 0) continue;
            for (let c = col; c < n; c++) a[r][c] -= factor * a[col][c];
            b[r] -= factor * b[col];
        }
    }

    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
        let s = b[row];
        for (let c = row + 1; c < n; c++) s -= a[row][c] * x[c];
        x[row] = Math.abs(a[row][row]) < 1e-14 ? 0 : s / a[row][row];
    }
    return x;
}

// ---------------------------------------------------------------------------
// KinSolve — kinematics solver
// ---------------------------------------------------------------------------

export interface KinSolveConfig {
    wheelCenter: Point;
    /** [Fore_Inner, Aft_Inner, Upright_Point] */
    lowerWishbone: [Point, Point, Point];
    /** [Fore_Inner, Aft_Inner, Upright_Point] */
    upperWishbone: [Point, Point, Point];
    /** [Inner, Outer] */
    tieRod: [Point, Point];
    /** [Inner, Outer] */
    pRod: [Point, Point];
    /** Center of rocker rotation */
    rocker: Point;
    /** [Lower, Upper] */
    shock: [Point, Point];

    fullJounce: number;
    fullRebound: number;

    unit?: string;
}

export class KinSolve {
    wheelCenter: Point;
    lowerWishbone: [Point, Point, Point];
    upperWishbone: [Point, Point, Point];
    tieRod: [Point, Point];
    pRod: [Point, Point];
    rocker: Point;
    shock: [Point, Point];

    fullJounce: number;
    fullRebound: number;
    unit: string;

    // Solved values
    bumpSteer: number[] = [];
    camberGain: number[] = [];
    casterGain: number[] = [];
    rollAngle: number[] = [];
    bumpZs: number[] = [];
    rollCenter: Vec2[] = [];
    instantCenter: Vec2[] = [];
    contactPatchYz: Vec2[] = [];
    scrubRadius: number[] = [];

    steps = 0;
    staticMotionRatio = 0;
    wheelTravel: number[] = [];
    shockLen: number[] = [];
    shockTravel: number[] = [];
    shockTravel2: number[] = [];
    mr: number[] = [];
    kpinter: Vec3[] = [];
    cpNew: Vec3[] = [];
    /** Actually-reachable rebound/jounce travel, for comparison against fullRebound/fullJounce. */
    achievedRebound = 0;
    achievedJounce = 0;

    constructor(cfg: KinSolveConfig) {
        this.wheelCenter = cfg.wheelCenter;
        this.lowerWishbone = cfg.lowerWishbone;
        this.upperWishbone = cfg.upperWishbone;
        this.tieRod = cfg.tieRod;
        this.pRod = cfg.pRod;
        this.rocker = cfg.rocker;
        this.shock = cfg.shock;
        this.fullJounce = cfg.fullJounce;
        this.fullRebound = cfg.fullRebound;
        this.unit = cfg.unit ?? "mm";
    }

    /**
     * Solves the suspension kinematics over a range of wheel travel.
     *
     * @param steps Number of steps in each direction (e.g. 10 -> 20 datapoints).
     * @param offsetToe Static toe offset (unused downstream currently, kept for parity).
     * @param offsetCamber Static camber offset.
     * @param offsetCaster Static caster offset.
     */
    solve(
        steps = 5,
        offsetToe = 0,
        offsetCamber = 0,
        offsetCaster = 0
    ): [
            Point,
            [Point, Point, Point],
            [Point, Point, Point],
            [Point, Point],
            [Point, Point],
            number[],
            number[],
            number[],
            number[],
            number[],
            Vec2[],
            Vec2[],
            number[]
        ] {
        const t0 = Date.now();

        // Step 0: initialize step size, linkage lengths, and lower a-arm array
        const vMove = this.fullJounce / steps;
        this.lowerWishbone[2].hist = [this.lowerWishbone[2].origin];

        const uprtHt = norm(sub(this.upperWishbone[2].origin, this.lowerWishbone[2].origin));
        const uTD = norm(sub(this.upperWishbone[2].origin, this.tieRod[1].origin));
        const lTD = norm(sub(this.lowerWishbone[2].origin, this.tieRod[1].origin));
        const trD = norm(sub(this.tieRod[0].origin, this.tieRod[1].origin));
        const uWc = norm(sub(this.upperWishbone[2].origin, this.wheelCenter.origin));
        const lWc = norm(sub(this.lowerWishbone[2].origin, this.wheelCenter.origin));
        const strArm = norm(sub(this.tieRod[1].origin, this.wheelCenter.origin));

        // Step 1: arcs traced out by the upper and lower outboard pickup points.
        const [nU, cU, rU] = intersectionOfSpheres(
            this.upperWishbone[0].origin,
            this.upperWishbone[1].origin,
            this.upperWishbone[2].origin
        );
        const [nL, cL, rL] = intersectionOfSpheres(
            this.lowerWishbone[0].origin,
            this.lowerWishbone[1].origin,
            this.lowerWishbone[2].origin
        );

        // Step 2: sample the lower outer pickup point along its arc, moving
        // symmetrically toward jounce and rebound. If a requested travel step
        // is geometrically unreachable (linkage has hit its physical limit),
        // hold the last reachable position instead of skipping the sample —
        // this guarantees the history array always ends up with exactly
        // 2 * steps + 1 entries, which every downstream calculation assumes.
        let lastLow: Vec3 = this.lowerWishbone[2].origin;
        let lastHigh: Vec3 = this.lowerWishbone[2].origin;
        for (let i = 1; i <= steps; i++) {
            const result = intersectionSphereCircle(
                this.lowerWishbone[2].origin,
                vMove * i,
                nL,
                cL,
                rL
            );
            let low: Vec3;
            let high: Vec3;
            if (!result) {
                console.warn(
                    `Lower wishbone travel step ${i} is beyond the reachable linkage geometry; holding last valid position.`
                );
                low = lastLow;
                high = lastHigh;
            } else {
                const [p0, p1] = result;
                if (p1[2] > p0[2]) {
                    low = p0;
                    high = p1;
                } else {
                    low = p1;
                    high = p0;
                }
                lastLow = low;
                lastHigh = high;
            }
            this.lowerWishbone[2].hist = [low, ...this.lowerWishbone[2].hist, high];
        }

        // Step 3: upper point at each sample = intersection of a sphere centered
        // at the lower outboard point (radius = upright height) with the upper arc.
        // Same hold-last-valid-position fallback as above, to keep this array's
        // length exactly matching lowerWishbone[2].hist.
        {
            let lastUpper: Vec3 = this.upperWishbone[2].origin;
            for (const pt of this.lowerWishbone[2].hist) {
                const result = intersectionSphereCircle(pt, uprtHt, nU, cU, rU);
                let chosen: Vec3;
                if (!result) {
                    console.warn(
                        "Upper wishbone outboard point is unreachable at this travel; holding last valid position."
                    );
                    chosen = lastUpper;
                } else {
                    const [p2, p3] = result;
                    chosen = p3[2] > p2[2] ? p3 : p2;
                }
                this.upperWishbone[2].hist.push(chosen);
                lastUpper = chosen;
            }
        }

        // Step 4 & 5: tie rod outer point, then wheel center, at each sample.
        // Both use the same hold-last-valid-position fallback so every hist
        // array stays the same length and index-aligned with the others.
        {
            let lastTieRod: Vec3 = this.tieRod[1].origin;
            let lastWheelCenter: Vec3 = this.wheelCenter.origin;
            for (const [lp, up] of zip2(this.lowerWishbone[2].hist, this.upperWishbone[2].hist)) {
                // Tie rod circle
                const [nT, cT, rT] = intersectionOfSpheresRadii(lp, up, lTD, uTD);
                const trResult = intersectionSphereCircle(this.tieRod[0].origin, trD, nT, cT, rT);
                let tieRodPt: Vec3;
                if (!trResult) {
                    console.warn(
                        "Tie rod outer point is unreachable at this travel; holding last valid position."
                    );
                    tieRodPt = lastTieRod;
                } else {
                    const [p4, p5] = trResult;
                    // The point further inboard is (almost) guaranteed to be wrong.
                    tieRodPt = p4[1] > p5[1] ? p4 : p5;
                }
                this.tieRod[1].hist.push(tieRodPt);
                lastTieRod = tieRodPt;

                // Wheel-center circle
                const [nW, cW, rW] = intersectionOfSpheresRadii(lp, up, lWc, uWc);
                const wcResult = intersectionSphereCircle(tieRodPt, strArm, nW, cW, rW);
                let wcPt: Vec3;
                if (!wcResult) {
                    console.warn(
                        "Wheel center is unreachable at this travel; holding last valid position."
                    );
                    wcPt = lastWheelCenter;
                } else {
                    const [p6, p7] = wcResult;
                    wcPt = p7[1] > p6[1] ? p7 : p6;
                }
                this.wheelCenter.hist.push(wcPt);
                lastWheelCenter = wcPt;
            }
        }

        const t1 = Date.now();
        console.log("Calculated suspension kinematics in", t1 - t0, "ms");
        console.log();

        // Sanity check: compare what was actually achieved against what was
        // requested. If the linkage geometry can't physically reach the full
        // requested fullJounce/fullRebound, a chunk of the sampled range will
        // have been held flat at the last reachable position (see the
        // hold-last-valid-position fallback above) — that shows up as
        // repeated/flat values in bumpSteer, camberGain, etc. near the
        // extremes. This log makes that condition obvious instead of having
        // to spot it in a table of numbers.
        const achievedRebound = norm(
            sub(this.lowerWishbone[2].hist[0], this.lowerWishbone[2].origin)
        );
        const achievedJounce = norm(
            sub(
                this.lowerWishbone[2].hist[this.lowerWishbone[2].hist.length - 1],
                this.lowerWishbone[2].origin
            )
        );
        console.log(
            `Rebound travel: requested ${this.fullRebound.toFixed(2)}${this.unit}, ` +
                `achieved ${achievedRebound.toFixed(2)}${this.unit}`
        );
        console.log(
            `Jounce travel: requested ${this.fullJounce.toFixed(2)}${this.unit}, ` +
                `achieved ${achievedJounce.toFixed(2)}${this.unit}`
        );
        this.achievedRebound = achievedRebound;
        this.achievedJounce = achievedJounce;
        if (achievedRebound < Math.abs(this.fullRebound) * 0.99) {
            console.warn(
                "Requested rebound travel exceeds what this linkage geometry can physically " +
                    "reach — the outer portion of the rebound samples were held at the last " +
                    "reachable position. Check units (mm vs in) and/or reduce fullRebound, " +
                    "or this may simply be the linkage's real travel limit."
            );
        }
        if (achievedJounce < Math.abs(this.fullJounce) * 0.99) {
            console.warn(
                "Requested jounce travel exceeds what this linkage geometry can physically " +
                    "reach — the outer portion of the jounce samples were held at the last " +
                    "reachable position. Check units (mm vs in) and/or reduce fullJounce, " +
                    "or this may simply be the linkage's real travel limit."
            );
        }

        console.log("Calculating kinematic changes over wheel travel:");
        const t0b = Date.now();

        // ---- Bump Steer ----
        console.log("* Bump Steer");
        const axlStatic = ptToLn(
            this.wheelCenter.origin,
            this.lowerWishbone[2].origin,
            this.upperWishbone[2].origin
        ).slice(0, 2);
        const axlHist = zip3(this.wheelCenter.hist, this.lowerWishbone[2].hist, this.upperWishbone[2].hist).map(
            ([pt, a, b]) => ptToLn(pt, a, b).slice(0, 2)
        );
        const staticAng = angle([0, 1], axlStatic);
        const bmpStr = axlHist.map((v) => angle([0, 1], v) - staticAng);

        // ---- Camber Gain ----
        console.log("* Camber Gain");
        const kp: Vec3[] = zip2(this.upperWishbone[2].hist, this.lowerWishbone[2].hist).map(([a, b]) =>
            sub(a, b) as Vec3
        );
        const kpYz: Vec2[] = kp.map(([, y, z]) => [y, z]);
        let cbrGn = kpYz.map((v) => -angle(v, [0, 1]));
        cbrGn = cbrGn.map((v) => v - cbrGn[steps] + offsetCamber);

        // ---- Caster changes ----
        console.log("* Caster changes");
        const kpXz: Vec2[] = kp.map(([x, , z]) => [x, z]);
        let cstrGn = kpXz.map((v) => -angle([0, 1], v));
        cstrGn = cstrGn.map((v) => v - cstrGn[steps] + offsetCaster);

        // ---- Roll center ----
        console.log("* Roll center");
        // Line-intersection approach adapted from:
        // https://web.archive.org/web/20111108065352/https://www.cs.mun.ca/%7Erod/2500/notes/numpy-arrays/numpy-arrays.html
        const uiMid = scale(
            add(this.upperWishbone[0].origin, this.upperWishbone[1].origin),
            0.5
        );
        const upr: Vec2[] = this.upperWishbone[2].hist.map(() => uiMid.slice(1) as Vec2);
        const lwr: Vec2[] = this.lowerWishbone[2].hist.map(
            () => this.lowerWishbone[0].origin.slice(1) as Vec2
        );
        const uoYz: Vec2[] = this.upperWishbone[2].hist.map((p) => p.slice(1) as Vec2);
        const loYz: Vec2[] = this.lowerWishbone[2].hist.map((p) => p.slice(1) as Vec2);
        const ic: Vec2[] = zip4(upr, uoYz, lwr, loYz).map(([a1, a2, b1, b2]) =>
            segIntersect(a1, a2, b1, b2)
        );

        // Contact patch: rotate the static wc->cp vector by the camber gain.
        const v0: Vec2 = [0, -this.wheelCenter.origin[2]];
        const vY = cbrGn.map(
            (a) => Math.cos((a * Math.PI) / 180) * v0[0] - Math.sin((a * Math.PI) / 180) * v0[1]
        );
        const vZ = cbrGn.map(
            (a) => Math.sin((a * Math.PI) / 180) * v0[0] + Math.cos((a * Math.PI) / 180) * v0[1]
        );
        const vYz: Vec2[] = zip2(vY, vZ).map(([y, z]) => [y, z]);
        let cpYz: Vec2[] = zip2(this.wheelCenter.hist, vYz).map(([wc, v]) => [
            wc[1] + v[0],
            wc[2] + v[1],
        ]);

        // Roll center in heave (opposite side)
        let oppIc: Vec2[] = ic.map(([y, z]) => [-y, z]);
        let oppCpYz: Vec2[] = cpYz.map(([y, z]) => [-y, z]);

        // Roll center in roll. NOTE: in the original Python, `opp_ic_r = opp_ic`
        // aliases the same list, so reversing one reverses both; reproduced here.
        const oppIcR = oppIc;
        oppIcR.reverse();
        oppCpYz.reverse();

        // Roll center points, in global coordinates (not the rolled ground plane).
        const rc: Vec2[] = zip4(cpYz, ic, oppCpYz, oppIc).map(([a1, a2, b1, b2]) =>
            segIntersect(a1, a2, b1, b2)
        );

        const gndPlnMidPtV: Vec2[] = zip2(cpYz, oppCpYz).map(([a, b]) => [
            (a[0] - b[0]) / 2,
            (a[1] - b[1]) / 2,
        ]);
        const gndPlnMidPt: Vec2[] = zip2(cpYz, gndPlnMidPtV).map(([pt, v]) => [
            pt[0] - v[0],
            pt[1] - v[1],
        ]);

        const rcPtToLn: Vec2[] = zip3(rc, cpYz, oppCpYz).map(([pt, cp, oppCp]) =>
            ptToLn(pt, cp, oppCp) as Vec2
        );
        const rcrZ = rcPtToLn.map((v) => norm(v));
        const rcProjected: Vec2[] = zip2(rc, rcPtToLn).map(([r, v]) => [r[0] + v[0], r[1] + v[1]]);
        const rcrY = zip2(rcProjected, gndPlnMidPt).map(([p, m]) => norm(sub(p, m)));

        const zInd = zip3(rc, cpYz, oppCpYz).map(([a, b, c]) =>
            -signNum((a[0] - b[0]) * (a[1] - c[1]) - (a[1] - b[1]) * (a[0] - c[0]))
        );

        const cPts: Vec2[] = zip2(gndPlnMidPt, rcPtToLn).map(([pt, v]) => [pt[0] + v[0], pt[1] + v[1]]);
        const yInd = zip3(rc, gndPlnMidPt, cPts).map(([a, b, c]) =>
            -signNum((a[0] - b[0]) * (a[1] - c[1]) - (a[1] - b[1]) * (a[0] - c[0]))
        );

        const rcr: Vec2[] = zip4(rcrY, rcrZ, yInd, zInd).map(([y, z, yi, zi]) => [y * yi, z * zi]);

        // ---- Scrub radius changes ----
        console.log("* Scrub Radius changes");
        const kpV: Vec3[] = zip2(this.upperWishbone[2].hist, this.lowerWishbone[2].hist).map(([a, b]) =>
            sub(a, b) as Vec3
        );
        const kpM = norm(sub(this.upperWishbone[2].origin, this.lowerWishbone[2].origin));
        const kpN: Vec3[] = kpV.map((v) => scale(v, 1 / kpM) as Vec3);

        // Line-plane intersection: https://en.wikipedia.org/wiki/Line%E2%80%93plane_intersection
        const p0Pt: Vec3 = [0, 0, 0];
        const l0: Vec3 = this.lowerWishbone[2].origin;
        const nGround: Vec3 = [0, 0, 1];
        const d = dot(sub(p0Pt, l0), nGround) / dot(kpN[steps], nGround);
        const kpIntersectStatic = add(l0, scale(kpN[steps], d)) as Vec3;
        const kpinterStatic = norm(sub(this.lowerWishbone[2].origin, kpIntersectStatic));
        this.kpinter = zip2(this.lowerWishbone[2].hist, kpN).map(
            ([pt, n]) => sub(pt, scale(n, kpinterStatic)) as Vec3
        );

        const bumpZs = this.wheelCenter.hist.map(([, , z]) => z - this.wheelCenter.origin[2]);
        this.cpNew = zip2(this.wheelCenter.hist, bumpZs).map(([wc, z]) => [wc[0], wc[1], z] as Vec3);
        const sr = zip2(this.cpNew, this.kpinter).map(([cp, kpt]) => cp[1] - kpt[1]);

        const rollAng = bumpZs.map(
            (z) => -((Math.sin(z / this.wheelCenter.origin[1]) * 180) / Math.PI)
        );

        // ---- Rocker calcs ----
        console.log("* Shock Travel");
        const wheelSideLever = norm(
            ptToLn(this.rocker.origin, this.pRod[0].origin, this.pRod[1].origin)
        );
        const shockSideLever = norm(
            ptToLn(this.rocker.origin, this.shock[1].origin, this.shock[0].origin)
        );
        this.staticMotionRatio = shockSideLever / wheelSideLever;

        // Figure out whether the push rod pickup rides on the upper or lower a-arm.
        const distToUpper = norm(sub(this.pRod[1].origin, this.upperWishbone[2].origin));
        const distToLower = norm(sub(this.pRod[1].origin, this.lowerWishbone[2].origin));
        let c1: Vec3, c2: Vec3;
        if (distToUpper > distToLower) {
            c1 = this.lowerWishbone[0].origin;
            c2 = this.lowerWishbone[1].origin;
        } else {
            c1 = this.upperWishbone[0].origin;
            c2 = this.upperWishbone[1].origin;
        }

        let [nI, cI, rI] = intersectionOfSpheres(c1, c2, this.pRod[1].origin);

        const higherPt = (pt0: Vec3, pt1: Vec3): Vec3 => (pt1[2] > pt0[2] ? pt1 : pt0);

        // Push-rod outboard point history. Holds the last valid position when
        // a travel step is beyond the reachable linkage geometry, so this
        // array's length always matches lowerWishbone[2].hist.
        {
            let lastPRod1: Vec3 = this.pRod[1].origin;
            for (const cS of this.lowerWishbone[2].hist) {
                const rS = norm(sub(this.lowerWishbone[2].origin, this.pRod[1].origin));
                const result = intersectionSphereCircle(cS, rS, nI, cI, rI);
                let pt: Vec3;
                if (!result) {
                    console.warn(
                        "Push rod outboard point is unreachable at this travel; holding last valid position."
                    );
                    pt = lastPRod1;
                } else {
                    const [p1, p2] = result;
                    pt = higherPt(p1, p2);
                }
                this.pRod[1].hist.push(pt);
                lastPRod1 = pt;
            }
        }

        // Circle of rocker
        cI = this.rocker.origin;
        rI = norm(sub(this.rocker.origin, this.pRod[0].origin));
        const crossForN = cross3(
            sub(this.rocker.origin, this.pRod[0].origin) as Vec3,
            sub(this.rocker.origin, this.shock[0].origin) as Vec3
        );
        nI = scale(crossForN, 1 / norm(crossForN)) as Vec3;

        // Push-rod inboard (rocker) point history. Same hold-last fallback, so
        // this stays the same length as pRod[1].hist / lowerWishbone[2].hist.
        {
            let lastPRod0: Vec3 = this.pRod[0].origin;
            for (const cS of this.pRod[1].hist) {
                const rS = norm(sub(this.pRod[0].origin, this.pRod[1].origin));
                const result = intersectionSphereCircle(cS, rS, nI, cI, rI);
                let pt: Vec3;
                if (!result) {
                    console.warn(
                        "Push rod inboard/rocker point is unreachable at this travel; holding last valid position."
                    );
                    pt = lastPRod0;
                } else {
                    const [p1, p2] = result;
                    pt = higherPt(p1, p2);
                }
                this.pRod[0].hist.push(pt);
                lastPRod0 = pt;
            }
        }

        // Rocker rotation angles, in rebound (rkrAngR) and jounce (rkrAngJ).
        const rkrAngR = new Array(steps).fill(0);
        for (let i = 1; i <= steps; i++) {
            const a = sub(this.rocker.origin, this.pRod[0].hist[i - 1]);
            const b = sub(this.rocker.origin, this.pRod[0].hist[i]);
            rkrAngR[i - 1] = angle(a, b);
        }

        const rkrAngJ = new Array(steps).fill(0);
        for (let i = steps + 1; i <= steps + steps; i++) {
            const a = sub(this.rocker.origin, this.pRod[0].hist[i - 1]);
            const b = sub(this.rocker.origin, this.pRod[0].hist[i]);
            rkrAngJ[i - steps - 1] = angle(a, b);
        }

        // Rotation of a point about an axis through `ctr` with unit direction
        // `uAxis`, by angle `theta` (radians). Assumes pt-ctr is already
        // perpendicular to the axis (true here, since it stays in the rocker plane).
        const rotationAboutAxis = (pt: Vec3, ctr: Vec3, uAxis: Vec3, theta: number): Vec3 => {
            const cs = Math.cos(theta);
            const sn = Math.sin(theta);
            const diff = sub(pt, ctr) as Vec3;
            const dNorm = norm(diff);
            const a = scale(diff, 1 / dNorm) as Vec3;
            const b = cross3(uAxis, a);
            const aR = add(scale(a, cs), scale(b, sn)) as Vec3;
            return add(ctr, scale(aR, dNorm)) as Vec3;
        };

        this.shock[1].hist.push(this.shock[1].origin);

        // Rebound angles are stored from full rebound inward; walk backward.
        for (const theta of [...rkrAngR].reverse()) {
            const negN = scale(nI, -1) as Vec3;
            const pt = rotationAboutAxis(this.shock[1].hist[0], cI, negN, (theta * Math.PI) / 180);
            this.shock[1].hist.unshift(pt);
        }

        for (const theta of rkrAngJ) {
            const pt = rotationAboutAxis(
                this.shock[1].hist[this.shock[1].hist.length - 1],
                cI,
                nI,
                (theta * Math.PI) / 180
            );
            this.shock[1].hist.push(pt);
        }

        // Deltas in wheel travel and shock travel.
        const wcZ = this.wheelCenter.hist.map(([, , z]) => z);
        this.wheelTravel = wcZ.slice(1).map((z, i) => z - wcZ[i]);
        this.shockLen = this.shock[1].hist.map((a) => norm(sub(a, this.shock[0].origin)));
        this.shockTravel = this.shockLen.slice(1).map((l, i) => l - this.shockLen[i]);
        this.shockTravel2 = this.shockLen
            .slice(0, -1)
            .map((a, i) => a - this.shockLen[i + 1]);
        if (this.shockTravel.some((t) => t < 0)) {
            console.log("Ruh roh, your shock went over center");
        }

        // ---- Dynamic Motion Ratio ----
        console.log("* Dynamic Motion Ratio");
        // See original notes: this is the average motion ratio between
        // successive sampled pairs, padded at the ends to match point count.
        const avgMr = zip2(this.shockTravel, this.wheelTravel)
            .filter(([, b]) => b > 0)
            .map(([a, b]) => a / b);
        this.mr =
            avgMr.length > 0
                ? [
                      avgMr[0],
                      ...avgMr.slice(0, -1).map((mr1, i) => (mr1 + avgMr[i + 1]) / 2),
                      avgMr[avgMr.length - 1],
                  ]
                : [];

        const t1b = Date.now();
        console.log();
        console.log("Calculated kinematic changes in", t1b - t0b, "ms");

        // Save calculated values
        this.steps = steps;
        this.camberGain = cbrGn;
        this.casterGain = cstrGn;
        this.rollAngle = rollAng;
        this.bumpZs = bumpZs;
        this.bumpSteer = bmpStr;
        this.rollCenter = rcr;
        this.instantCenter = ic;
        this.contactPatchYz = cpYz;
        this.scrubRadius = sr;

        return [
            this.wheelCenter,
            this.lowerWishbone,
            this.upperWishbone,
            this.pRod,
            this.tieRod,
            this.camberGain,
            this.casterGain,
            this.rollAngle,
            this.bumpZs,
            this.bumpSteer,
            this.rollCenter,
            this.instantCenter,
            this.scrubRadius,
        ];
    }

    /**
     * Solves for the six suspension link forces (and reaction moments about
     * the wheel center) needed to react an applied tire force, at every sampled
     * suspension position. See https://fswiki.us/Suspension_Forces.
     *
     * Returns one 6-length array per sample: [LF, LA, UF, UA, TR, PR] force
     * magnitudes along each link's unit vector.
     */
    linkforce(Fx = 0, Fy = 0, Fz = 0, pneumaticTrail = 0): number[][] {
        // Norms of each of the 6 links.
        const lenLF = norm(sub(this.lowerWishbone[0].origin, this.lowerWishbone[2].origin));
        const lenLA = norm(sub(this.lowerWishbone[1].origin, this.lowerWishbone[2].origin));
        const lenUF = norm(sub(this.upperWishbone[0].origin, this.upperWishbone[2].origin));
        const lenUA = norm(sub(this.upperWishbone[1].origin, this.upperWishbone[2].origin));
        const lenTR = norm(sub(this.tieRod[0].origin, this.tieRod[1].origin));
        const lenPR = norm(sub(this.pRod[0].origin, this.pRod[1].origin));

        // Unit vectors along each link, at every sample.
        const nLF = this.lowerWishbone[2].hist.map(
            (pt) => scale(sub(this.lowerWishbone[0].origin, pt), 1 / lenLF) as Vec3
        );
        const nLA = this.lowerWishbone[2].hist.map(
            (pt) => scale(sub(this.lowerWishbone[1].origin, pt), 1 / lenLA) as Vec3
        );
        const nUF = this.upperWishbone[2].hist.map(
            (pt) => scale(sub(this.upperWishbone[0].origin, pt), 1 / lenUF) as Vec3
        );
        const nUA = this.upperWishbone[2].hist.map(
            (pt) => scale(sub(this.upperWishbone[1].origin, pt), 1 / lenUA) as Vec3
        );
        const nTR = this.tieRod[1].hist.map(
            (pt) => scale(sub(this.tieRod[0].origin, pt), 1 / lenTR) as Vec3
        );
        const nPR = this.pRod[1].hist.map(
            (pt) => scale(sub(this.pRod[0].origin, pt), 1 / lenPR) as Vec3
        );

        // Vectors from the wheel center to each upright pickup point (forces are
        // all treated as acting at the wheel center).
        const rU = this.upperWishbone[2].hist.map((pt) => sub(pt, this.wheelCenter.origin) as Vec3);
        const rL = this.lowerWishbone[2].hist.map((pt) => sub(pt, this.wheelCenter.origin) as Vec3);
        const rTr = this.tieRod[1].hist.map((pt) => sub(pt, this.wheelCenter.origin) as Vec3);
        const rPr = this.pRod[1].hist.map((pt) => sub(pt, this.wheelCenter.origin) as Vec3);

        // "Unit moments" r x n (scaled correctly once solved for magnitude).
        const mLF = zip2(rL, nLF).map(([a, b]) => cross3(a, b));
        const mLA = zip2(rL, nLA).map(([a, b]) => cross3(a, b));
        const mUF = zip2(rU, nUF).map(([a, b]) => cross3(a, b));
        const mUA = zip2(rU, nUA).map(([a, b]) => cross3(a, b));
        const mTR = zip2(rTr, nTR).map(([a, b]) => cross3(a, b));
        const mPR = zip2(rPr, nPR).map(([a, b]) => cross3(a, b));

        // Moment arms / trail.
        const mechTrail = zip2(this.cpNew, this.kpinter).map(([cp, kp]) => cp[0] - kp[0]);
        const trail = mechTrail.map((mt) => mt + pneumaticTrail); // (retained for parity; matches original's unused `trail`)
        void trail;

        const nSamples = 2 * this.steps + 1;
        const Mx = new Array(nSamples).fill(Fy * this.wheelCenter.origin[2]);
        const My = new Array(nSamples).fill(-Fx * this.wheelCenter.origin[2]);
        const Mz = zip2(this.scrubRadius, mechTrail).map(([sr, mt]) => -Fx * sr + Fy * mt);

        const results: number[][] = [];

        for (let i = 0; i < nSamples; i++) {
            // Each 6x6 block: 3 force-balance rows + 3 moment-balance rows, with
            // unknowns = force magnitude along each of the 6 links.
            const A: number[][] = [
                [nLF[i][0], nLA[i][0], nUF[i][0], nUA[i][0], nTR[i][0], nPR[i][0]],
                [nLF[i][1], nLA[i][1], nUF[i][1], nUA[i][1], nTR[i][1], nPR[i][1]],
                [nLF[i][2], nLA[i][2], nUF[i][2], nUA[i][2], nTR[i][2], nPR[i][2]],
                [mLF[i][0], mLA[i][0], mUF[i][0], mUA[i][0], mTR[i][0], mPR[i][0]],
                [mLF[i][1], mLA[i][1], mUF[i][1], mUA[i][1], mTR[i][1], mPR[i][1]],
                [mLF[i][2], mLA[i][2], mUF[i][2], mUA[i][2], mTR[i][2], mPR[i][2]],
            ];
            const b = [Fx, Fy, Fz, Mx[i], My[i], Mz[i]];
            results.push(solveLinearSystem(A, b));
        }

        return results;
    }
}