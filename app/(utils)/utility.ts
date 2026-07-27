export type Point = {

    x: number,
    y: number,
    z: number,

}

export const calculateLineDistanceFromTwoPoints = (a: Point, b: Point) : number => Math.sqrt(((a.x - b.x) * (a.x - b.x)) + ((a.y - b.y) * (a.y - b.y)) + ((a.z - b.z) * (a.z - b.z)));
