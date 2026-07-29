"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Vec3 = [number, number, number];

interface Props {
    vecs: Vec3[];
    // Expects 9 points in order:
    // [0] ucaFront (a), [1] ucaRear (b), [2] ucaBall (c)
    // [3] lcaFront (d), [4] lcaRear (e), [5] lcaBall (f)
    // [6] toeInboard (g), [7] toeOutboard (h), [8] wheelCenter (i)
}

function isValidVecs(vecs: Vec3[] | undefined | null): vecs is Vec3[] {
    if (!vecs || vecs.length < 9) return false;
    return vecs
        .slice(0, 9)
        .every(
            (v) =>
                Array.isArray(v) &&
                v.length === 3 &&
                v.every((n) => typeof n === "number" && Number.isFinite(n))
        );
}

export default function CorrectedSuspensionScene({ vecs }: Props) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "no-data">("loading");

    const dataValid = isValidVecs(vecs);

    useEffect(() => {
        if (!mountRef.current) return;

        if (!dataValid) {
            setStatus("no-data");
            return;
        }
        setStatus("loading");

        const container = mountRef.current;

        // -------------------------------------------------------------
        // Mutable handles so cleanup can safely dispose whatever got
        // created, even if init fires asynchronously (see tryInit below).
        // -------------------------------------------------------------
        let renderer: THREE.WebGLRenderer | null = null;
        let scene: THREE.Scene | null = null;
        let camera: THREE.PerspectiveCamera | null = null;
        let controls: OrbitControls | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let animationFrameId = 0;
        let initFrameId = 0;
        let disposed = false;

        function init(width: number, height: number) {
            if (disposed) return;

            // -------------------------------------------------------------
            // 1. SCENE & CAMERA SETUP
            // -------------------------------------------------------------
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0f1218);

            camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 2000);

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                powerPreference: "high-performance",
                logarithmicDepthBuffer: true, // Prevents z-fighting/clipping artifacts
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.2;
            container.appendChild(renderer.domElement);

            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            // -------------------------------------------------------------
            // 2. PARSE VECTORS & ORIENTATION CORRECTION
            // -------------------------------------------------------------
            const rawPoints = vecs.slice(0, 9).map((v) => new THREE.Vector3(v[0], v[1], v[2]));

            // Find the "up" axis using the kingpin line (ucaBall -> lcaBall).
            // On any real double-wishbone suspension this line is close to
            // vertical no matter how the control arms themselves are angled,
            // so it's a far more reliable signal than averaging arm pivots.
            const kingpinRaw = new THREE.Vector3().subVectors(rawPoints[2], rawPoints[5]); // ucaBall - lcaBall
            const absComp = [Math.abs(kingpinRaw.x), Math.abs(kingpinRaw.y), Math.abs(kingpinRaw.z)];
            const dominantAxis = absComp.indexOf(Math.max(...absComp)); // 0=x, 1=y, 2=z

            // Remap into Three.js's Y-up convention using a proper rotation
            // (determinant +1), never a single-axis flip. A single-axis flip
            // mirrors the whole assembly into its reflection instead of
            // rotating it, which is what made the previous version look off.
            function remapUp(v: THREE.Vector3): THREE.Vector3 {
                switch (dominantAxis) {
                    case 2: // source data is Z-up
                        return new THREE.Vector3(v.x, v.z, -v.y);
                    case 0: // source data is X-up
                        return new THREE.Vector3(v.y, v.x, -v.z);
                    default: // already Y-up
                        return v.clone();
                }
            }

            let points = rawPoints.map(remapUp);

            // If the UCA ball joint still ends up below the LCA ball joint,
            // the assembly is upside down — correct with a proper 180 degree
            // rotation (flips Y and Z together) rather than mirroring one axis.
            if (points[2].y < points[5].y) {
                points = points.map((v) => new THREE.Vector3(v.x, -v.y, -v.z));
            }

            const [
                ucaFront, ucaRear, ucaBall,
                lcaFront, lcaRear, lcaBall,
                toeInboard, toeOutboard, wheelCenter,
            ] = points;

            // Bounding box & Center calculation
            const box = new THREE.Box3().setFromPoints(points);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 1.0);

            camera.near = maxDim * 0.01;
            camera.far = maxDim * 50;
            camera.updateProjectionMatrix();

            controls.minDistance = maxDim * 0.4;
            controls.maxDistance = maxDim * 8;

            camera.position.set(
                center.x + maxDim * 2.2,
                center.y + maxDim * 0.6,
                center.z + maxDim * 2.2
            );
            camera.lookAt(center);
            controls.target.copy(center);

            // -------------------------------------------------------------
            // 3. LIGHTING
            // -------------------------------------------------------------
            // Hemisphere light gives a soft sky/ground gradient instead of
            // flat ambient, which reads much better on metallic parts.
            const hemiLight = new THREE.HemisphereLight(0x8899ff, 0x0f1218, 0.6);
            scene.add(hemiLight);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
            mainLight.position.set(center.x + maxDim * 3, center.y + maxDim * 6, center.z + maxDim * 4);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.set(2048, 2048);
            mainLight.shadow.bias = -0.0005;
            scene.add(mainLight);

            const fillLight = new THREE.DirectionalLight(0x3388ff, 1.2);
            fillLight.position.set(center.x - maxDim * 3, center.y - maxDim * 2, center.z - maxDim * 3);
            scene.add(fillLight);

            const groundY = box.min.y - maxDim * 0.2;
            const grid = new THREE.GridHelper(maxDim * 6, 24, 0xff5500, 0x223344);
            grid.position.set(center.x, groundY, center.z);
            scene.add(grid);

            // -------------------------------------------------------------
            // 4. MATERIALS & GEOMETRY BUILDERS
            // -------------------------------------------------------------
            const jointRadius = maxDim * 0.035;
            const armRadius = maxDim * 0.02;
            const frameRadius = maxDim * 0.025;

            const matUca = new THREE.MeshStandardMaterial({ color: 0xff3300, metalness: 0.5, roughness: 0.2 });
            const matLca = new THREE.MeshStandardMaterial({ color: 0x0088ff, metalness: 0.5, roughness: 0.2 });
            const matUpright = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.85, roughness: 0.15 });
            const matFrame = new THREE.MeshStandardMaterial({ color: 0x2a2e3d, metalness: 0.7, roughness: 0.4 });
            const matToe = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.8, roughness: 0.2 });
            const matSpring = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.5 });
            const matJoint = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 });
            const matRotor = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.25 });
            const matTire = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.85 });

            function addJoint(pos: THREE.Vector3, mat = matJoint, r = jointRadius) {
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 24), mat);
                mesh.position.copy(pos);
                mesh.castShadow = true;
                scene!.add(mesh);
            }

            function addTube(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material, radius = armRadius) {
                const path = new THREE.LineCurve3(a, b);
                const geo = new THREE.TubeGeometry(path, 12, radius, 16, false);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene!.add(mesh);
            }

            // Closest point on the infinite line through a-b to point p.
            function projectOnLine(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
                const ab = new THREE.Vector3().subVectors(b, a);
                const t = new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq();
                return new THREE.Vector3().addVectors(a, ab.clone().multiplyScalar(t));
            }

            function addCoilover(bottomMount: THREE.Vector3, topMount: THREE.Vector3) {
                const dir = new THREE.Vector3().subVectors(topMount, bottomMount);
                const length = dir.length();

                addTube(bottomMount, topMount, matToe, armRadius * 0.85);

                const springRadius = armRadius * 2.2;
                const turns = 10;
                const pointsCount = 120;
                const curvePoints: THREE.Vector3[] = [];

                for (let i = 0; i <= pointsCount; i++) {
                    const t = i / pointsCount;
                    const angle = t * turns * Math.PI * 2;
                    const localPos = new THREE.Vector3(
                        Math.cos(angle) * springRadius,
                        t * (length * 0.7) + (length * 0.15),
                        Math.sin(angle) * springRadius
                    );
                    curvePoints.push(localPos);
                }

                const springCurve = new THREE.CatmullRomCurve3(curvePoints);
                const springGeo = new THREE.TubeGeometry(springCurve, 100, armRadius * 0.4, 8, false);
                const springMesh = new THREE.Mesh(springGeo, matSpring);

                springMesh.position.copy(bottomMount);
                springMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
                springMesh.castShadow = true;
                scene!.add(springMesh);
            }

            // -------------------------------------------------------------
            // 5. ASSEMBLE GEOMETRY
            // -------------------------------------------------------------

            // A. Hardpoint Spheres
            points.forEach((pt) => addJoint(pt));

            // B. Chassis Subframe Rails
            addTube(ucaFront, ucaRear, matFrame, frameRadius);
            addTube(lcaFront, lcaRear, matFrame, frameRadius);
            addTube(ucaFront, lcaFront, matFrame, frameRadius * 0.8);
            addTube(ucaRear, lcaRear, matFrame, frameRadius * 0.8);

            // C. Upper Control Arm (UCA Wishbone)
            addTube(ucaFront, ucaBall, matUca);
            addTube(ucaRear, ucaBall, matUca);
            addTube(ucaFront, ucaRear, matUca, armRadius * 0.85);

            // D. Lower Control Arm (LCA Wishbone)
            addTube(lcaFront, lcaBall, matLca, armRadius * 1.2);
            addTube(lcaRear, lcaBall, matLca, armRadius * 1.2);
            addTube(lcaFront, lcaRear, matLca, armRadius);

            // E. Upright / Steering Knuckle Assembly
            // A real upright is built off the kingpin axis (upper ball joint ->
            // lower ball joint) as a single line, with the axle stub and the
            // steering arm branching off wherever they fall along that line —
            // not wired independently to both ball joints, which produces a
            // boxy shape that doesn't read as a real knuckle.
            addTube(lcaBall, ucaBall, matUpright, armRadius * 1.4); // kingpin axis

            const wheelStubBase = projectOnLine(wheelCenter, lcaBall, ucaBall);
            addTube(wheelStubBase, wheelCenter, matUpright, armRadius * 1.15); // axle stub
            addJoint(wheelStubBase, matUpright, jointRadius * 0.6);

            const steeringArmBase = projectOnLine(toeOutboard, lcaBall, ucaBall);
            addTube(steeringArmBase, toeOutboard, matUpright, armRadius * 0.9); // steering arm
            addJoint(steeringArmBase, matUpright, jointRadius * 0.6);

            // F. Toe Link / Steering Tie Rod
            addTube(toeInboard, toeOutboard, matToe, armRadius * 0.75);

            // G. Shock Absorber / Damper Mounts
            // No frame shock-tower hardpoint is provided, so this stays an
            // approximation — but the upper mount is pulled inboard (toward the
            // vehicle centerline, assumed X=0) rather than sitting directly
            // above the UCA pickups, which is closer to how Baja shock towers
            // are actually laid out.
            const lcaMid = new THREE.Vector3().addVectors(lcaFront, lcaRear).multiplyScalar(0.5);
            const shockLowerMount = new THREE.Vector3().addVectors(lcaMid, lcaBall).multiplyScalar(0.45);

            const ucaMidX = (ucaFront.x + ucaRear.x) / 2;
            const ucaMidZ = (ucaFront.z + ucaRear.z) / 2;
            const inboardSign = ucaMidX >= 0 ? -1 : 1;
            const shockUpperMount = new THREE.Vector3(
                ucaMidX + inboardSign * maxDim * 0.15,
                ucaFront.y + maxDim * 0.5,
                ucaMidZ
            );
            addTube(ucaFront, shockUpperMount, matFrame, frameRadius * 0.7);
            addTube(ucaRear, shockUpperMount, matFrame, frameRadius * 0.7);
            addJoint(shockUpperMount, matFrame, jointRadius * 0.8);
            addJoint(shockLowerMount, matJoint, jointRadius * 0.8);
            addCoilover(shockLowerMount, shockUpperMount);

            // H. Wheel Hub, Rotor & Tire
            // Spin axis approximated as the axle-stub direction (kingpin line
            // -> wheel center), which is accurate whenever camber is small —
            // simpler and more consistent than the old double-cross-product.
            const spindleDir = new THREE.Vector3().subVectors(wheelCenter, wheelStubBase).normalize();
            const upAlign = new THREE.Vector3(0, 1, 0);
            const alignQuat = new THREE.Quaternion().setFromUnitVectors(upAlign, spindleDir);

            const rotorGeo = new THREE.CylinderGeometry(maxDim * 0.28, maxDim * 0.28, maxDim * 0.035, 32);
            const rotorMesh = new THREE.Mesh(rotorGeo, matRotor);
            rotorMesh.position.copy(wheelCenter);
            rotorMesh.quaternion.copy(alignQuat);
            rotorMesh.castShadow = true;
            scene.add(rotorMesh);

            const tireRadius = maxDim * 0.5;
            const tireTubeRadius = maxDim * 0.16;
            const tireGeo = new THREE.TorusGeometry(tireRadius, tireTubeRadius, 12, 36);
            const tireMesh = new THREE.Mesh(tireGeo, matTire);
            tireMesh.position.copy(wheelCenter);
            tireMesh.quaternion.copy(alignQuat);
            tireMesh.rotateX(Math.PI / 2); // torus is built in XY plane by default
            tireMesh.castShadow = true;
            tireMesh.receiveShadow = true;
            scene.add(tireMesh);

            // -------------------------------------------------------------
            // 6. RESIZE HANDLING
            // -------------------------------------------------------------
            // ResizeObserver tracks the *container's* box, not just the
            // window — so this keeps rendering correctly if the panel is
            // resized by a layout change, a sidebar toggle, etc., not only
            // on a browser window resize.
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const w = entry.contentRect.width;
                    const h = entry.contentRect.height;
                    if (w <= 0 || h <= 0 || !camera || !renderer) continue;
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h);
                }
            });
            resizeObserver.observe(container);

            // -------------------------------------------------------------
            // 7. RENDER LOOP
            // -------------------------------------------------------------
            function animate() {
                animationFrameId = requestAnimationFrame(animate);
                controls!.update();
                renderer!.render(scene!, camera!);
            }
            animate();

            setStatus("ready");
        }

        // The container can have zero size on the frame it first mounts
        // (parent not yet laid out, class not yet applied, etc). Rather
        // than building a scene against a 0x0 canvas — which breaks the
        // camera aspect ratio and silently fails to display — wait until
        // the container actually has real dimensions.
        function tryInit() {
            if (disposed) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0) {
                init(w, h);
            } else {
                initFrameId = requestAnimationFrame(tryInit);
            }
        }
        tryInit();

        return () => {
            disposed = true;
            cancelAnimationFrame(initFrameId);
            cancelAnimationFrame(animationFrameId);
            resizeObserver?.disconnect();
            controls?.dispose();

            if (scene) {
                scene.traverse((obj) => {
                    const mesh = obj as THREE.Mesh;
                    if ((mesh as any).geometry) (mesh as any).geometry.dispose();
                    const mat = (mesh as any).material;
                    if (mat) {
                        if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
                        else mat.dispose();
                    }
                });
            }

            renderer?.dispose();
            if (renderer && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vecs, dataValid]);

    return (
        <div
            className="relative w-full mx-auto rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950"
            style={{ maxWidth: "1100px", aspectRatio: "16 / 10", minHeight: "420px" }}
        >
            <div ref={mountRef} className="w-full h-full" />

            {status !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm font-sans pointer-events-none">
                    {status === "no-data"
                        ? "No valid suspension geometry data provided."
                        : "Loading suspension model…"}
                </div>
            )}

            {status === "ready" && (
                <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700/80 text-xs text-slate-100 font-sans shadow-xl pointer-events-none">
                    <h4 className="font-extrabold text-sm text-orange-400 mb-2 tracking-wider uppercase">Sample Visualization (work in progress)</h4>
                    <div className="space-y-1.5 font-medium">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                            <span>Upper Control Arm (UCA)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                            <span>Lower Control Arm (LCA)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
                            <span>Steering Tie Rod & Damper</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-slate-300 inline-block" />
                            <span>Upright / Knuckle & Rotor</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-slate-700 inline-block" />
                            <span>Tire</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
