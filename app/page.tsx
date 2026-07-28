"use client";

import { useState } from "react";
import { KinSolve, Point, Vec3 } from "./(utils)/utility";

// One row of the results table, mirroring the columns main.py prints:
// Step | Travel(mm) | Camber | Caster | Toe | Scrub | RC Y | RC Z
// (Note: main.py's "Toe" column is actually populated from `bump_steer`,
// not a true toe-angle series — that naming is preserved here for parity.)
interface ResultRow {
    step: number;
    travel: number;
    camber: number;
    caster: number;
    toe: number;
    scrub: number;
    rcY: number;
    rcZ: number;
}

interface SolveSummary {
    rows: ResultRow[];
    staticIndex: number;
    staticMotionRatio: number;
    unit: string;
}

function getNum(formData: FormData, name: string, fallback = 0): number {
    const raw = formData.get(name)?.toString();
    if (raw === undefined || raw === null || raw === "") return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isNaN(parsed) ? fallback : parsed;
}

const radiansToDegrees = (radians: number): number => radians * (180 / Math.PI);
const mmToInches = (mm: number): number => mm * 0.0393701;
const inToMM = (inches: number) => inches * 25.4;

function getPoint(formData: FormData, prefix: string): Vec3 {
    return [
        inToMM(getNum(formData, `${prefix}x`)),
        inToMM(getNum(formData, `${prefix}y`)),
        inToMM(getNum(formData, `${prefix}z`)),
    ];
}

export default function Home() {
    const [summary, setSummary] = useState<SolveSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const calculate = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        const formData = new FormData(e.currentTarget);

        try {
            // --- Suspension points, named to match main.py's a-i / j-n scheme ---
            // Upper Control Arm
            const ufi = new Point(getPoint(formData, "a")); // UCA Inbd, Front
            const uai = new Point(getPoint(formData, "b")); // UCA Inbd, Rear
            const uo = new Point(getPoint(formData, "c")); // Upper Ball Joint
            // Lower Control Arm
            const lfi = new Point(getPoint(formData, "d")); // LCA Inbd, Front
            const lai = new Point(getPoint(formData, "e")); // LCA Inbd, Rear
            const lo = new Point(getPoint(formData, "f")); // Lower Ball Joint
            // Toe / steering link
            const tri = new Point(getPoint(formData, "g")); // Toe Link Inboard
            const tro = new Point(getPoint(formData, "h")); // Toe Link Outboard
            // Wheel center
            const wc = new Point(getPoint(formData, "i"));

            // Pushrod / rocker / shock
            const pro = new Point(getPoint(formData, "j")); // Push Rod Outboard (upright side)
            const pri = new Point(getPoint(formData, "k")); // Push Rod Inboard (rocker side)
            const rkr = new Point(getPoint(formData, "l")); // Rocker pivot center
            const skl = new Point(getPoint(formData, "m")); // Shock Lower
            const sku = new Point(getPoint(formData, "n")); // Shock Upper

            const fullJounce = Math.abs(inToMM(getNum(formData, "positiveTravel", 5)));
            const fullRebound = -Math.abs(inToMM(getNum(formData, "negativeTravel", 5)));
            const numSteps = Math.max(1, Math.round(getNum(formData, "numSteps", 20)));

            const unit = "mm";

            const kin = new KinSolve({
                wheelCenter: wc,
                lowerWishbone: [lfi, lai, lo],
                upperWishbone: [ufi, uai, uo],
                tieRod: [tri, tro],
                pRod: [pri, pro],
                rocker: rkr,
                shock: [skl, sku],
                fullJounce,
                fullRebound,
                unit,
            });

            kin.solve(numSteps, 0, 0, 0);

            const rows: ResultRow[] = kin.bumpZs.map((travel: any, i: any) => ({
                step: i,
                travel,
                camber: kin.camberGain[i],
                caster: kin.casterGain[i],
                toe: kin.bumpSteer[i],
                scrub: kin.scrubRadius[i],
                rcY: kin.rollCenter[i][0],
                rcZ: kin.rollCenter[i][1],
            }));

            setSummary({
                rows,
                staticIndex: numSteps,
                staticMotionRatio: kin.staticMotionRatio,
                unit,
            });
        } catch (err) {
            console.error(err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Solver failed — check that the linkage geometry is physically valid."
            );
            setSummary(null);
        }
    };


    const staticRow = summary?.rows[summary.staticIndex];

    return (
        <main className="px-10 my-10">
            <div className="mb-2">
                <div className="mb-3">
                    <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                        Suspension Geometry Analyzer
                    </h1>

                    <p className="mt-3 text-lg text-base-content/80">
                        An open-source suspension geometry and kinematics analyzer for double wishbone
                        suspension systems.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-base-content/70">
                        <span>
                            Developed by <span className="font-semibold">Nick Fanelli</span> &{" "}
                            <span className="font-semibold">Marina Greer</span>
                        </span>

                        <span className="hidden sm:inline">•</span>

                        <a
                            href="https://github.com/Nick-Fanelli/suspension-geometry-analyzer"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-base-300 px-3 py-1.5 transition hover:bg-base-200 hover:border-primary"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="h-5 w-5"
                            >
                                <path d="M12 .5C5.648.5.5 5.648.5 12a11.5 11.5 0 008 10.94c.585.108.798-.254.798-.566v-2.2c-3.252.707-3.938-1.566-3.938-1.566-.532-1.35-1.3-1.71-1.3-1.71-1.062-.726.08-.712.08-.712 1.174.083 1.792 1.206 1.792 1.206 1.044 1.788 2.74 1.272 3.408.973.106-.756.409-1.272.744-1.565-2.596-.296-5.327-1.298-5.327-5.777 0-1.276.456-2.319 1.204-3.137-.121-.296-.522-1.488.114-3.102 0 0 .982-.314 3.218 1.198a11.2 11.2 0 015.86 0c2.235-1.512 3.216-1.198 3.216-1.198.638 1.614.237 2.806.116 3.102.75.818 1.203 1.861 1.203 3.137 0 4.49-2.735 5.478-5.338 5.768.42.361.794 1.073.794 2.164v3.208c0 .315.211.68.804.565A11.502 11.502 0 0023.5 12C23.5 5.648 18.352.5 12 .5z" />
                            </svg>

                            View on GitHub
                        </a>
                    </div>

                    <p className="mt-6 max-w-4xl text-sm leading-relaxed text-base-content/70">
                        Inspired by the work of <strong>spooky-simon</strong>. Special thanks to{" "}
                        <strong>MathWorks</strong> and <strong>Firgelli Automations</strong> for
                        their excellent technical documentation and mathematical references that
                        helped shape this project.
                    </p>
                    <div className="mt-5 rounded-xl border border-base-300 bg-base-200/40 p-4">
                        <h2 className="mb-2 font-semibold">Units</h2>

                        <p className="text-sm leading-relaxed text-base-content/80">
                            <strong>Inputs:</strong> Inches (in)
                            <br />
                            <strong>Outputs:</strong> Inches (in) and Degrees (°)
                        </p>

                        <p className="mt-3 text-sm leading-relaxed text-base-content/70">
                            The solver internally performs all calculations using millimeters.
                            Although this application accepts inches, you can easily support other
                            units by modifying the <code>mmToInches()</code> and{" "}
                            <code>inToMM()</code> conversion functions if you choose to fork the
                            repository.
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={calculate}>
                <div className="">
                    <ul className="pt-5 w-full">
                        <li className="font-bold text-xl mb-2">Upper Control Arm Points</li>

                        <li className="">
                            <p>UCA Inbd, Front (a)</p>
                            <div>
                                <input type="number" name="ax" placeholder="X" className="input mx-1 w-20" defaultValue={4.72441} step="any" required />
                                <input type="number" name="ay" placeholder="Y" className="input mx-1 w-20" defaultValue={9.45} step="any" required />
                                <input type="number" name="az" placeholder="Z" className="input mx-1 w-20" defaultValue={8.78} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>UCA Inbd, Rear (b)</p>
                            <div>
                                <input type="number" name="bx" placeholder="X" className="input mx-1 w-20" defaultValue={-4.72441} step="any" required />
                                <input type="number" name="by" placeholder="Y" className="input mx-1 w-20" defaultValue={9.45} step="any" required />
                                <input type="number" name="bz" placeholder="Z" className="input mx-1 w-20" defaultValue={8.5} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Upper Ball Joint (c)</p>
                            <div>
                                <input type="number" name="cx" placeholder="X" className="input mx-1 w-20" defaultValue={-0.2807087} step="any" required />
                                <input type="number" name="cy" placeholder="Y" className="input mx-1 w-20" defaultValue={23.43} step="any" required />
                                <input type="number" name="cz" placeholder="Z" className="input mx-1 w-20" defaultValue={11.77} step="any" required />
                            </div>
                        </li>

                        <li className="font-bold text-xl mb-2 my-5">Lower Control Arm Points</li>

                        <li className="">
                            <p>LCA Inbd, Front (d)</p>
                            <div>
                                <input type="number" name="dx" placeholder="X" className="input mx-1 w-20" defaultValue={6.88} step="any" required />
                                <input type="number" name="dy" placeholder="Y" className="input mx-1 w-20" defaultValue={6.88} step="any" required />
                                <input type="number" name="dz" placeholder="Z" className="input mx-1 w-20" defaultValue={4.37} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>LCA Inbd, Rear (e)</p>
                            <div>
                                <input type="number" name="ex" placeholder="X" className="input mx-1 w-20" defaultValue={-6.9} step="any" required />
                                <input type="number" name="ey" placeholder="Y" className="input mx-1 w-20" defaultValue={6.9} step="any" required />
                                <input type="number" name="ez" placeholder="Z" className="input mx-1 w-20" defaultValue={4.37} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Lower Ball Joint (f)</p>
                            <div>
                                <input type="number" name="fx" placeholder="X" className="input mx-1 w-20" defaultValue={-0.12} step="any" required />
                                <input type="number" name="fy" placeholder="Y" className="input mx-1 w-20" defaultValue={23.94} step="any" required />
                                <input type="number" name="fz" placeholder="Z" className="input mx-1 w-20" defaultValue={4.50} step="any" required />
                            </div>
                        </li>

                        <li className="font-bold text-xl mb-2 my-5">Toe Link &amp; Wheel Center</li>

                        <li className="">
                            <p>Toe Link Inboard (g)</p>
                            <div>
                                <input type="number" name="gx" placeholder="X" className="input mx-1 w-20" defaultValue={2.16} step="any" required />
                                <input type="number" name="gy" placeholder="Y" className="input mx-1 w-20" defaultValue={5.50} step="any" required />
                                <input type="number" name="gz" placeholder="Z" className="input mx-1 w-20" defaultValue={6.41} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Toe Link Outboard (h)</p>
                            <div>
                                <input type="number" name="hx" placeholder="X" className="input mx-1 w-20" defaultValue={2.17} step="any" required />
                                <input type="number" name="hy" placeholder="Y" className="input mx-1 w-20" defaultValue={23.62} step="any" required />
                                <input type="number" name="hz" placeholder="Z" className="input mx-1 w-20" defaultValue={6.4} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Wheel Center (i)</p>
                            <div>
                                <input type="number" name="ix" placeholder="X" className="input mx-1 w-20" defaultValue={0} step="any" required />
                                <input type="number" name="iy" placeholder="Y" className="input mx-1 w-20" defaultValue={25} step="any" required />
                                <input type="number" name="iz" placeholder="Z" className="input mx-1 w-20" defaultValue={9} step="any" required />
                            </div>
                        </li>

                        <li className="font-bold text-xl mb-2 my-5">Pushrod, Rocker &amp; Shock Points</li>

                        <li className="">
                            <p>Push Rod Outboard, Upright Side (j)</p>
                            <div>
                                <input type="number" name="jx" placeholder="X" className="input mx-1 w-20" defaultValue={-0.5} step="any" required />
                                <input type="number" name="jy" placeholder="Y" className="input mx-1 w-20" defaultValue={22} step="any" required />
                                <input type="number" name="jz" placeholder="Z" className="input mx-1 w-20" defaultValue={5} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Push Rod Inboard, Rocker Side (k)</p>
                            <div>
                                <input type="number" name="kx" placeholder="X" className="input mx-1 w-20" defaultValue={-0.8} step="any" required />
                                <input type="number" name="ky" placeholder="Y" className="input mx-1 w-20" defaultValue={13.80} step="any" required />
                                <input type="number" name="kz" placeholder="Z" className="input mx-1 w-20" defaultValue={19.21} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Rocker Pivot Center (l)</p>
                            <div>
                                <input type="number" name="lx" placeholder="X" className="input mx-1 w-20" defaultValue={-0.92} step="any" required />
                                <input type="number" name="ly" placeholder="Y" className="input mx-1 w-20" defaultValue={11} step="any" required />
                                <input type="number" name="lz" placeholder="Z" className="input mx-1 w-20" defaultValue={17.72} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Shock Lower Mount (m)</p>
                            <div>
                                <input type="number" name="mx" placeholder="X" className="input mx-1 w-20" defaultValue={1.18} step="any" required />
                                <input type="number" name="my" placeholder="Y" className="input mx-1 w-20" defaultValue={5.9} step="any" required />
                                <input type="number" name="mz" placeholder="Z" className="input mx-1 w-20" defaultValue={11.8} step="any" required />
                            </div>
                        </li>

                        <li className="">
                            <p>Shock Upper Mount (n)</p>
                            <div>
                                <input type="number" name="nx" placeholder="X" className="input mx-1 w-20" defaultValue={-1} step="any" required />
                                <input type="number" name="ny" placeholder="Y" className="input mx-1 w-20" defaultValue={6} step="any" required />
                                <input type="number" name="nz" placeholder="Z" className="input mx-1 w-20" defaultValue={19.3} step="any" required />
                            </div>
                        </li>
                    </ul>

                    <div className="pt-10 w-full">
                        <ul>
                            <li className="">
                                <p>Positive Travel Allowance</p>
                                <div>
                                    <input
                                        type="number"
                                        name="positiveTravel"
                                        placeholder="Allowance"
                                        className="input mx-2 w-30"
                                        defaultValue={1}
                                        step="any"
                                        required
                                    />
                                </div>
                            </li>

                            <li className="">
                                <p>Negative Travel Allowance</p>
                                <div>
                                    <input
                                        type="number"
                                        name="negativeTravel"
                                        placeholder="Allowance"
                                        className="input mx-2 w-30"
                                        defaultValue={1}
                                        step="any"
                                        required
                                    />
                                </div>
                            </li>

                            <li className="">
                                <p>Number of Steps</p>
                                <div>
                                    <input
                                        type="number"
                                        name="numSteps"
                                        placeholder="Steps"
                                        className="input mx-2 w-30"
                                        defaultValue={100}
                                        step="1"
                                        min="1"
                                        required
                                    />
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <button className="btn btn-success mt-10 w-full" type="submit">
                    Calculate
                </button>
            </form>

            {
                error && (
                    <p className="text-red-600 font-semibold mt-6">{error}</p>
                )
            }

            {
                summary && (
                    <div className="mt-10 pb-20">

                        <h2 className="text-2xl font-bold mb-4">Simulated Kinematics</h2>
                        {
                            summary && (
                                <p className="text-sm opacity-70 mt-1">
                                    Static motion ratio: {summary.staticMotionRatio.toFixed(3)}
                                </p>
                            )
                        }
                        <div className="overflow-x-auto">
                            <table className="table table-zebra">
                                <thead>
                                    <tr>
                                        <th className="text-right">Step</th>
                                        <th className="text-right">Travel (in)</th>
                                        <th className="text-right">Camber (deg)</th>
                                        <th className="text-right">Caster (deg)</th>
                                        <th className="text-right">Toe (deg)</th>
                                        <th className="text-right">Scrub (in)</th>
                                        <th className="text-right">RC Y (in)</th>
                                        <th className="text-right">RC Z (in)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.rows.map((row) => (
                                        <tr
                                            key={row.step}
                                            className={`${row.step === summary.staticIndex ? "font-bold" : ""} ${row.travel === 0 ? "bg-blue-400" : ""}`}
                                        >
                                            <td className="text-right">{row.step}</td>
                                            <td className="text-right">{mmToInches(row.travel).toFixed(3)}</td>
                                            <td className="text-right">{row.camber.toFixed(3)}</td>
                                            <td className="text-right">{row.caster.toFixed(3)}</td>
                                            <td className="text-right">{row.toe.toFixed(3)}</td>
                                            <td className="text-right">{mmToInches(row.scrub).toFixed(3)}</td>
                                            <td className="text-right">{mmToInches(row.rcY).toFixed(3)}</td>
                                            <td className="text-right">{mmToInches(row.rcZ).toFixed(3)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }
        </main >
    );
}
