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

const radiansToDegrees = (radians: number) : number => radians * (180 / Math.PI);
const mmToInches = (mm: number) : number => mm * 0.0393701;
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
    <main className="pt-4 px-10">
      <h1 className="text-3xl font-bold">Suspension Geometry Analyzer</h1>

      <form onSubmit={calculate}>
        <div className="flex">
          <ul className="pt-10 w-full max-w-150">
            <li className="font-bold text-xl mb-2">Upper Control Arm Points</li>

            <li className="flex items-center justify-between">
              <p>UCA Inbd, Front (a)</p>
              <div>
                <input type="number" name="ax" placeholder="X" className="input mx-2 w-30" defaultValue={4.72441} step="any" required />
                <input type="number" name="ay" placeholder="Y" className="input mx-2 w-30" defaultValue={9.45} step="any" required />
                <input type="number" name="az" placeholder="Z" className="input mx-2 w-30" defaultValue={8.78} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>UCA Inbd, Rear (b)</p>
              <div>
                <input type="number" name="bx" placeholder="X" className="input mx-2 w-30" defaultValue={-4.72441} step="any" required />
                <input type="number" name="by" placeholder="Y" className="input mx-2 w-30" defaultValue={9.45} step="any" required />
                <input type="number" name="bz" placeholder="Z" className="input mx-2 w-30" defaultValue={8.5} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Upper Ball Joint (c)</p>
              <div>
                <input type="number" name="cx" placeholder="X" className="input mx-2 w-30" defaultValue={-0.2807087} step="any" required />
                <input type="number" name="cy" placeholder="Y" className="input mx-2 w-30" defaultValue={23.43} step="any" required />
                <input type="number" name="cz" placeholder="Z" className="input mx-2 w-30" defaultValue={11.77} step="any" required />
              </div>
            </li>

            <li className="font-bold text-xl mb-2 my-5">Lower Control Arm Points</li>

            <li className="flex items-center justify-between">
              <p>LCA Inbd, Front (d)</p>
              <div>
                <input type="number" name="dx" placeholder="X" className="input mx-2 w-30" defaultValue={6.88} step="any" required />
                <input type="number" name="dy" placeholder="Y" className="input mx-2 w-30" defaultValue={6.88} step="any" required />
                <input type="number" name="dz" placeholder="Z" className="input mx-2 w-30" defaultValue={4.37} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>LCA Inbd, Rear (e)</p>
              <div>
                <input type="number" name="ex" placeholder="X" className="input mx-2 w-30" defaultValue={-6.9} step="any" required />
                <input type="number" name="ey" placeholder="Y" className="input mx-2 w-30" defaultValue={6.9} step="any" required />
                <input type="number" name="ez" placeholder="Z" className="input mx-2 w-30" defaultValue={4.37} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Lower Ball Joint (f)</p>
              <div>
                <input type="number" name="fx" placeholder="X" className="input mx-2 w-30" defaultValue={-0.12} step="any" required />
                <input type="number" name="fy" placeholder="Y" className="input mx-2 w-30" defaultValue={23.94} step="any" required />
                <input type="number" name="fz" placeholder="Z" className="input mx-2 w-30" defaultValue={4.50} step="any" required />
              </div>
            </li>

            <li className="font-bold text-xl mb-2 my-5">Toe Link &amp; Wheel Center</li>

            <li className="flex items-center justify-between">
              <p>Toe Link Inboard (g)</p>
              <div>
                <input type="number" name="gx" placeholder="X" className="input mx-2 w-30" defaultValue={2.16} step="any" required />
                <input type="number" name="gy" placeholder="Y" className="input mx-2 w-30" defaultValue={5.50} step="any" required />
                <input type="number" name="gz" placeholder="Z" className="input mx-2 w-30" defaultValue={6.41} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Toe Link Outboard (h)</p>
              <div>
                <input type="number" name="hx" placeholder="X" className="input mx-2 w-30" defaultValue={2.17} step="any" required />
                <input type="number" name="hy" placeholder="Y" className="input mx-2 w-30" defaultValue={23.62} step="any" required />
                <input type="number" name="hz" placeholder="Z" className="input mx-2 w-30" defaultValue={6.4} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Wheel Center (i)</p>
              <div>
                <input type="number" name="ix" placeholder="X" className="input mx-2 w-30" defaultValue={0} step="any" required />
                <input type="number" name="iy" placeholder="Y" className="input mx-2 w-30" defaultValue={25} step="any" required />
                <input type="number" name="iz" placeholder="Z" className="input mx-2 w-30" defaultValue={9} step="any" required />
              </div>
            </li>

            <li className="font-bold text-xl mb-2 my-5">Pushrod, Rocker &amp; Shock Points</li>

            <li className="flex items-center justify-between">
              <p>Push Rod Outboard, Upright Side (j)</p>
              <div>
                <input type="number" name="jx" placeholder="X" className="input mx-2 w-30" defaultValue={-0.5} step="any" required />
                <input type="number" name="jy" placeholder="Y" className="input mx-2 w-30" defaultValue={22} step="any" required />
                <input type="number" name="jz" placeholder="Z" className="input mx-2 w-30" defaultValue={5} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Push Rod Inboard, Rocker Side (k)</p>
              <div>
                <input type="number" name="kx" placeholder="X" className="input mx-2 w-30" defaultValue={-0.8} step="any" required />
                <input type="number" name="ky" placeholder="Y" className="input mx-2 w-30" defaultValue={13.80} step="any" required />
                <input type="number" name="kz" placeholder="Z" className="input mx-2 w-30" defaultValue={19.21} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Rocker Pivot Center (l)</p>
              <div>
                <input type="number" name="lx" placeholder="X" className="input mx-2 w-30" defaultValue={-0.92} step="any" required />
                <input type="number" name="ly" placeholder="Y" className="input mx-2 w-30" defaultValue={11} step="any" required />
                <input type="number" name="lz" placeholder="Z" className="input mx-2 w-30" defaultValue={17.72} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Shock Lower Mount (m)</p>
              <div>
                <input type="number" name="mx" placeholder="X" className="input mx-2 w-30" defaultValue={1.18} step="any" required />
                <input type="number" name="my" placeholder="Y" className="input mx-2 w-30" defaultValue={5.9} step="any" required />
                <input type="number" name="mz" placeholder="Z" className="input mx-2 w-30" defaultValue={11.8} step="any" required />
              </div>
            </li>

            <li className="flex items-center justify-between">
              <p>Shock Upper Mount (n)</p>
              <div>
                <input type="number" name="nx" placeholder="X" className="input mx-2 w-30" defaultValue={-1} step="any" required />
                <input type="number" name="ny" placeholder="Y" className="input mx-2 w-30" defaultValue={6} step="any" required />
                <input type="number" name="nz" placeholder="Z" className="input mx-2 w-30" defaultValue={19.3} step="any" required />
              </div>
            </li>
          </ul>

          <div className="mt-19 ml-20">
            <ul>
              <li className="flex items-center justify-between">
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

              <li className="flex items-center justify-between">
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

              <li className="flex items-center justify-between">
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

          <div className="mt-10">
            <h2 className="text-xl font-bold">
              Camber: {staticRow ? `${staticRow.camber.toFixed(3)}°` : "VALUE"}
            </h2>
            <h2 className="text-xl font-bold">
              Toe: {staticRow ? `${staticRow.toe.toFixed(3)}°` : "VALUE"}
            </h2>
            <h2 className="text-xl font-bold">
              Caster: {staticRow ? `${staticRow.caster.toFixed(3)}°` : "VALUE"}
            </h2>
            <h2 className="text-xl font-bold">
              Roll Center:{" "}
              {staticRow
                ? `Y ${staticRow.rcY.toFixed(2)} / Z ${staticRow.rcZ.toFixed(2)} ${summary!.unit}`
                : "VALUE"}
            </h2>
            {summary && (
              <p className="text-sm opacity-70 mt-1">
                Static motion ratio: {summary.staticMotionRatio.toFixed(3)}
              </p>
            )}
          </div>
        </div>

      <button className="btn btn-success mt-10" type="submit">
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
        <h2 className="text-2xl font-bold mb-4">Suspension Kinematics</h2>
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
                  className={row.step === summary.staticIndex ? "font-bold" : ""}
                >
                  <td className="text-right">{row.step}</td>
                  <td className="text-right">{mmToInches(row.travel).toFixed(3)}</td>
                  <td className="text-right">{radiansToDegrees(row.camber).toFixed(3)}</td>
                  <td className="text-right">{radiansToDegrees(row.caster).toFixed(3)}</td>
                  <td className="text-right">{radiansToDegrees(row.toe).toFixed(3)}</td>
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
