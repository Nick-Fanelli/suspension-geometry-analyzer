export type Point = {

    x: number,
    y: number,
    z: number,

}

export type Vector3d = {

    x: number,
    y: number,
    z: number,

}

export type SuspensionGeometry = {

    pointA: Point
    pointB: Point
    pointC: Point
    pointD: Point
    pointE: Point
    pointF: Point
    pointG: Point
    pointH: Point
    pointI: Point

    distAC: number
    distBC: number
    distDF: number
    distEF: number
    distGH: number
    distCF: number
    distCH: number
    distCI: number
    distHI: number
    distHF: number
    distFI: number

}

export type SuspensionResults = {

    camber: number
    toe: number
    caster: number

}

export const crossProduct = (a: Vector3d, b: Vector3d) : Vector3d => {

    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };

}

export const dotProduct = (a: Vector3d, b: Vector3d) : number => {

    return a.x * b.x + a.y * b.y + a.z * b.z;

}

export const calculateLineDistanceFromTwoPoints = (a: Point, b: Point): number => Math.sqrt(((a.x - b.x) * (a.x - b.x)) + ((a.y - b.y) * (a.y - b.y)) + ((a.z - b.z) * (a.z - b.z)));
export const magnitude = (a: Vector3d) => Math.sqrt((a.x * a.x) + (a.y * a.y) + (a.z * a.z));

export const generateSuspensionGeometryFromPoints = (pointA: Point, pointB: Point, pointC: Point, pointD: Point, pointE: Point, pointF: Point, pointG: Point, pointH: Point, pointI: Point): SuspensionGeometry => {

    const distAC = calculateLineDistanceFromTwoPoints(pointA, pointC);
    const distBC = calculateLineDistanceFromTwoPoints(pointB, pointC);
    const distDF = calculateLineDistanceFromTwoPoints(pointD, pointF);
    const distEF = calculateLineDistanceFromTwoPoints(pointE, pointF);
    const distGH = calculateLineDistanceFromTwoPoints(pointG, pointH);

    const distCF = calculateLineDistanceFromTwoPoints(pointC, pointF);
    const distCH = calculateLineDistanceFromTwoPoints(pointC, pointH);
    const distCI = calculateLineDistanceFromTwoPoints(pointC, pointI);

    const distHI = calculateLineDistanceFromTwoPoints(pointH, pointI);
    const distHF = calculateLineDistanceFromTwoPoints(pointH, pointF);
    const distFI = calculateLineDistanceFromTwoPoints(pointF, pointI);

    return {
        pointA,
        pointB,
        pointC,
        pointD,
        pointE,
        pointF,
        pointG,
        pointH,
        pointI,

        distAC,
        distBC,
        distDF,
        distEF,
        distGH,
        distCF,
        distCH,
        distCI,
        distHI,
        distHF,
        distFI,

    }

}

export const calculateSuspension = (geometry: SuspensionGeometry): SuspensionResults | null => {

    const upperBallJointToWheelCenter: Vector3d = {
        x: geometry.pointC.x - geometry.pointI.x,
        y: geometry.pointC.y - geometry.pointI.y,
        z: geometry.pointC.z - geometry.pointI.z,
    }

    const lowerBallJoinToWheelCenter: Vector3d = {
        x: geometry.pointF.x - geometry.pointI.x,
        y: geometry.pointF.y - geometry.pointI.y,
        z: geometry.pointF.z - geometry.pointI.z,
    }

    const wheelPlaneNormal: Vector3d = crossProduct(upperBallJointToWheelCenter, lowerBallJoinToWheelCenter);
    const xIdentity: Vector3d = { x: 1, y: 0, z: 0 }; 

    const camber = Math.acos(dotProduct(xIdentity, wheelPlaneNormal) / (magnitude(xIdentity) * magnitude(wheelPlaneNormal))) || 0;

    console.log(camber);

    // const uprightVector = {
    //     y: geometry.pointC.y - geometry.pointF.y,
    //     z: geometry.pointC.z - geometry.pointF.z
    // }

    // const steeringAxis = {
    //     x: geometry.pointC.x - geometry.pointF.x,
    //     z: geometry.pointC.z - geometry.pointF.z
    // }

    // const wheelDirection = {
    //     x: geometry.pointJ.x - geometry.pointK.x,
    //     y: geometry.pointI.y - geometry.pointK.y
    // }

    // const camber = Math.atan2(uprightVector.y, uprightVector.z) * 180 / Math.PI;
    // const caster = Math.atan2(steeringAxis.x, steeringAxis.z) * 180 / Math.PI;
    // const toe = Math.atan2(toeVector.y, toeVector.x) * 180 / Math.PI;

    // console.table({
    //     Camber: camber,
    //     Caster: caster,
    //     Toe: toe
    // });

    return null;

}