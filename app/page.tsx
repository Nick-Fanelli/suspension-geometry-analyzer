"use client";

import { calculateLineDistanceFromTwoPoints, calculateSuspension, generateSuspensionGeometryFromPoints, Point } from "./(utils)/utility";

export default function Home() {

    const calculate = (e: React.SubmitEvent<HTMLFormElement>) => {

        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        const pointA: Point = { x: Number.parseFloat(formData.get("ax")?.toString() || "0"), y: Number.parseFloat(formData.get("ay")?.toString() || "0"), z: Number.parseFloat(formData.get("az")?.toString() || "0") }
        const pointB: Point = { x: Number.parseFloat(formData.get("bx")?.toString() || "0"), y: Number.parseFloat(formData.get("by")?.toString() || "0"), z: Number.parseFloat(formData.get("bz")?.toString() || "0") }
        const pointC: Point = { x: Number.parseFloat(formData.get("cx")?.toString() || "0"), y: Number.parseFloat(formData.get("cy")?.toString() || "0"), z: Number.parseFloat(formData.get("cz")?.toString() || "0") }
        const pointD: Point = { x: Number.parseFloat(formData.get("dx")?.toString() || "0"), y: Number.parseFloat(formData.get("dy")?.toString() || "0"), z: Number.parseFloat(formData.get("dz")?.toString() || "0") }
        const pointE: Point = { x: Number.parseFloat(formData.get("ex")?.toString() || "0"), y: Number.parseFloat(formData.get("ey")?.toString() || "0"), z: Number.parseFloat(formData.get("ez")?.toString() || "0") }
        const pointF: Point = { x: Number.parseFloat(formData.get("fx")?.toString() || "0"), y: Number.parseFloat(formData.get("fy")?.toString() || "0"), z: Number.parseFloat(formData.get("fz")?.toString() || "0") }
        const pointG: Point = { x: Number.parseFloat(formData.get("gx")?.toString() || "0"), y: Number.parseFloat(formData.get("gy")?.toString() || "0"), z: Number.parseFloat(formData.get("gz")?.toString() || "0") }
        const pointH: Point = { x: Number.parseFloat(formData.get("hx")?.toString() || "0"), y: Number.parseFloat(formData.get("hy")?.toString() || "0"), z: Number.parseFloat(formData.get("hz")?.toString() || "0") }
        const pointI: Point = { x: Number.parseFloat(formData.get("ix")?.toString() || "0"), y: Number.parseFloat(formData.get("iy")?.toString() || "0"), z: Number.parseFloat(formData.get("iz")?.toString() || "0") }

        console.table([
            { Point: "A", X: pointA.x, Y: pointA.y, Z: pointA.z },
            { Point: "B", X: pointB.x, Y: pointB.y, Z: pointB.z },
            { Point: "C", X: pointC.x, Y: pointC.y, Z: pointC.z },
            { Point: "D", X: pointD.x, Y: pointD.y, Z: pointD.z },
            { Point: "E", X: pointE.x, Y: pointE.y, Z: pointE.z },
            { Point: "F", X: pointF.x, Y: pointF.y, Z: pointF.z },
            { Point: "G", X: pointG.x, Y: pointG.y, Z: pointG.z },
            { Point: "H", X: pointH.x, Y: pointH.y, Z: pointH.z },
            { Point: "I", X: pointI.x, Y: pointI.y, Z: pointI.z },
        ]);

        const suspensionGeometry = generateSuspensionGeometryFromPoints(pointA, pointB, pointC, pointD, pointE, pointF, pointG, pointH, pointI);
        const suspensionResults = calculateSuspension(suspensionGeometry);
        console.log(suspensionResults);

    }

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
                                <input type="number" name="ax" id="" placeholder="X" className="input mx-2 w-30" defaultValue={10} step="any" required />
                                <input type="number" name="ay" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={12} step="any" required />
                                <input type="number" name="az" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={21} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>UCA Inbd, Rear (b)</p>
                            <div>
                                <input type="number" name="bx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={5.5} step="any" required />
                                <input type="number" name="by" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={6} step="any" required />
                                <input type="number" name="bz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={21} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>Upper Ball Joint (c)</p>
                            <div>
                                <input type="number" name="cx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={23} step="any" required />
                                <input type="number" name="cy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={0} step="any" required />
                                <input type="number" name="cz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={14.25} step="any" required />
                            </div>
                        </li>
                        <li className="font-bold text-xl mb-2 my-5">Lower Control Arm Points</li>
                        <li className="flex items-center justify-between">
                            <p>LCA Inbd, Front (d)</p>
                            <div>
                                <input type="number" name="dx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={10} step="any" required />
                                <input type="number" name="dy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={12} step="any" required />
                                <input type="number" name="dz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={14} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>LCA Inbd, Rear (e)</p>
                            <div>
                                <input type="number" name="ex" id="" placeholder="X" className="input mx-2 w-30" defaultValue={5.5} step="any" required />
                                <input type="number" name="ey" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={6} step="any" required />
                                <input type="number" name="ez" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={14} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>Lower Ball Joint (f)</p>
                            <div>
                                <input type="number" name="fx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={23} step="any" required />
                                <input type="number" name="fy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={0} step="any" required />
                                <input type="number" name="fz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={7.75} step="any" required />
                            </div>
                        </li>
                        <li className="font-bold text-xl mb-2  my-5">Final Points</li>
                        <li className="flex items-center justify-between">
                            <p>Toe Link Inboard (g)</p>
                            <div>
                                <input type="number" name="gx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={5.5} step="any" required />
                                <input type="number" name="gy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={6} step="any" required />
                                <input type="number" name="gz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={21} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>Toe Link Outboard (h)</p>
                            <div>
                                <input type="number" name="hx" id="" placeholder="X" className="input mx-2 w-30" defaultValue={23} step="any" required />
                                <input type="number" name="hy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={3} step="any" required />
                                <input type="number" name="hz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={11} step="any" required />
                            </div>
                        </li>
                        <li className="flex items-center justify-between">
                            <p>Wheel Center (i)</p>
                            <div>
                                <input type="number" name="ix" id="" placeholder="X" className="input mx-2 w-30" defaultValue={23} step="any" required />
                                <input type="number" name="iy" id="" placeholder="Y" className="input mx-2 w-30" defaultValue={0} step="any" required />
                                <input type="number" name="iz" id="" placeholder="Z" className="input mx-2 w-30" defaultValue={11} step="any" required />
                            </div>
                        </li>
                    </ul>

                    <div className="mt-19 ml-20">
                        <ul className="">
                            <li className="flex items-center justify-between">
                                <p>Positive Travel Allowance</p>
                                <div>
                                    <input type="number" name="" id="" placeholder="Allowance" className="input mx-2 w-30" defaultValue={5} required />
                                </div>
                            </li>
                            <li className="flex items-center justify-between">
                                <p>Negative Travel Allowance</p>
                                <div>
                                    <input type="number" name="" id="" placeholder="Allowance" className="input mx-2 w-30" defaultValue={5} required />
                                </div>
                            </li>
                        </ul>

                        <div className="mt-10">
                            <h2 className="text-xl font-bold">Camber: VALUE</h2>
                            <h2 className="text-xl font-bold">Toe: VALUE</h2>
                            <h2 className="text-xl font-bold">Caster: VALUE</h2>
                            <h2 className="text-xl font-light italic mt-2 opacity-50">Roll Center: COMING SOON</h2>
                        </div>
                    </div>
                </div>

                <button className="btn btn-success mt-10" type="submit">Calculate</button>
            </form>

        </main>

    );

}
