import * as THREE from "three";
import { render3D, projectToRect, studioLights, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";
import {
  FONT_MONO,
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  rgba,
  roundRect,
  sub,
  easeOutBack,
  activeBeatIndex
} from "./common";

type MoleculeScene = {
  kind: "molecule";
  id: string;
  sayIntro?: string;
  title: string;
  mode: "equation" | "structure";
  equation?: {
    left: { formula: string; count: number }[];
    right: { formula: string; count: number }[];
    sayLeft: string;
    sayReact: string;
    sayRight: string;
  };
  structure?: {
    atoms: { el: string; x: number; y: number }[];
    bonds: { a: number; b: number; order: number }[];
    steps: { reveal?: number[]; say: string }[];
  };
};

const CPK_COLORS: Record<string, string> = {
  H: "#ffffff",
  C: "#38bdf8",
  N: "#8b5cf6",
  O: "#ef4444",
  P: "#f59e0b",
  S: "#facc15",
  Cl: "#4ade80",
  Na: "#ec4899",
};

export function paintMolecule(ctx: CanvasRenderingContext2D, scene: MoleculeScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { vertical } = layout;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 4);

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt;

  // Header Title
  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);

  const areaX = layout.contentX;
  const areaY = layout.contentY + layout.unit * 1.8;
  const areaW = layout.contentW;
  const areaH = layout.contentH - layout.unit * 2.8;
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  // Outer panel container
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (scene.mode === "equation" && scene.equation) {
    const eq = scene.equation;
    const stage = Math.min(2, Math.floor(env.p * 3));
    let captionText = eq.sayLeft;
    if (stage === 1) captionText = eq.sayReact;
    else if (stage === 2) captionText = eq.sayRight;

    // Reactants & Products String
    const leftStr = eq.left.map((item) => `${item.count > 1 ? item.count : ""}${item.formula}`).join("  +  ");
    const rightStr = eq.right.map((item) => `${item.count > 1 ? item.count : ""}${item.formula}`).join("  +  ");

    const eqY = areaY + areaH * 0.42;

    // Left Reactants
    ctx.font = `700 ${Math.round(layout.unit * 1.1)}px ${FONT_MONO}`;
    ctx.fillStyle = stage >= 0 ? palette.accent : THEME.textDim;
    ctx.textAlign = "right";
    ctx.fillText(leftStr, areaX + areaW * 0.42, eqY);

    // Reaction Arrow
    const arrowX = areaX + areaW * 0.5;
    ctx.font = `700 ${Math.round(layout.unit * 1.2)}px ${FONT_SANS}`;
    ctx.fillStyle = stage === 1 ? palette.secondary : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText("➔", arrowX, eqY - 2);

    // Right Products
    ctx.font = `700 ${Math.round(layout.unit * 1.1)}px ${FONT_MONO}`;
    ctx.fillStyle = stage === 2 ? palette.secondary : THEME.textDim;
    ctx.textAlign = "left";
    ctx.fillText(rightStr, areaX + areaW * 0.58, eqY);

    // Caption Banner
    const bannerH = layout.unit * 1.6;
    const bannerY = areaY + areaH - bannerH - layout.unit * 0.4;
    const bannerW = areaW - layout.unit * 1.2;
    const bannerX = areaX + layout.unit * 0.6;

    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(captionText, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  } else if (scene.mode === "structure" && scene.structure) {
    const struct = scene.structure;
    const activeStepIdx = Math.min(
      struct.steps.length - 1,
      activeBeatIndex(env.beats, (scene.sayIntro ? 1 : 0) + struct.steps.length, env.p) - (scene.sayIntro ? 1 : 0)
    );
    const activeStep = struct.steps[Math.max(0, activeStepIdx)];
    
    // Calculate pop state per atom based on activeStep and time
    const pops = struct.atoms.map((a, idx) => {
        const isRevealed = !activeStep.reveal || activeStep.reveal.includes(idx) || activeStepIdx > 0;
        if (!isRevealed) return 0;
        return easeOutBack(sub(env.p, idx * 0.1, 0.15));
    });

    const spreadX = vertical ? 3.5 : 4.5;
    const spreadZ = vertical ? 4.5 : 3.5;
    
    const worldPos = (ax: number, ay: number) => {
        return new THREE.Vector3(
            (ax / 11 - 0.5) * spreadX * 2,
            0,
            (ay / 11 - 0.5) * spreadZ * 2
        );
    };

    const key = scene.id + "-mol3d";

    const build = (): ThreeBundle => {
        const s = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
        camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
        camera.lookAt(0, 0, 0);
        studioLights(s, palette.accent, palette.secondary);

        const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(palette.accent), new THREE.Color("#31435a"));
        (grid.material as THREE.Material).transparent = true;
        (grid.material as THREE.Material).opacity = 0.2;
        grid.position.y = -0.8;
        s.add(grid);

        const shadowPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(spreadX * 4, spreadZ * 4),
            new THREE.ShadowMaterial({ opacity: 0.4 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.8;
        shadowPlane.receiveShadow = true;
        s.add(shadowPlane);

        const atomMeshes: { mesh: THREE.Mesh, el: string, startPos: THREE.Vector3 }[] = [];
        struct.atoms.forEach(a => {
            const atomColor = CPK_COLORS[a.el] ?? palette.accent;
            const radius = a.el === "H" ? 0.3 : 0.5;
            const geo = new THREE.SphereGeometry(radius, 32, 32);
            const mat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(atomColor),
                emissive: new THREE.Color(atomColor),
                emissiveIntensity: 0.1,
                metalness: 0.2,
                roughness: 0.3,
                clearcoat: 0.8,
                clearcoatRoughness: 0.2,
                transparent: true
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            const pos = worldPos(a.x, a.y);
            mesh.position.copy(pos);
            s.add(mesh);
            atomMeshes.push({ mesh, el: a.el, startPos: pos });
        });

        const bondMeshes: { mesh: THREE.Group, a1: number, a2: number, order: number }[] = [];
        struct.bonds.forEach(b => {
            const p1 = worldPos(struct.atoms[b.a].x, struct.atoms[b.a].y);
            const p2 = worldPos(struct.atoms[b.b].x, struct.atoms[b.b].y);
            
            const dist = p1.distanceTo(p2);
            const group = new THREE.Group();
            
            const bondColor = "#94a3b8";
            const bondMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(bondColor),
                metalness: 0.5,
                roughness: 0.2,
                clearcoat: 1.0,
                transparent: true
            });
            
            if (b.order === 1) {
                const geo = new THREE.CylinderGeometry(0.1, 0.1, dist, 16);
                const mesh = new THREE.Mesh(geo, bondMat);
                mesh.rotation.x = Math.PI / 2; // Align along Z
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
            } else {
                const offset = 0.15;
                for (let i = -0.5; i <= 0.5; i += 1) {
                    const geo = new THREE.CylinderGeometry(0.08, 0.08, dist, 16);
                    const mesh = new THREE.Mesh(geo, bondMat);
                    mesh.rotation.x = Math.PI / 2;
                    mesh.position.x = i * offset * 2; 
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    group.add(mesh);
                }
            }
            
            const mid = p1.clone().add(p2).multiplyScalar(0.5);
            group.position.copy(mid);
            group.lookAt(p2);
            
            s.add(group);
            bondMeshes.push({ mesh: group, a1: b.a, a2: b.b, order: b.order });
        });

        const update = (elapsedMs: number, ctxData: { pops: number[], tEnt: number }) => {
            const { pops, tEnt } = ctxData;
            
            atomMeshes.forEach((a, i) => {
                const pop = pops[i] ?? 0;
                a.mesh.scale.setScalar(Math.max(0.001, pop * tEnt));
                const bob = Math.sin(elapsedMs / 1000 + i) * 0.1;
                a.mesh.position.y = a.startPos.y + bob * pop;
                a.mesh.visible = (pop * tEnt) > 0.01;
                (a.mesh.material as THREE.MeshPhysicalMaterial).opacity = tEnt;
            });
            
            bondMeshes.forEach(b => {
                const pop1 = pops[b.a1] ?? 0;
                const pop2 = pops[b.a2] ?? 0;
                const bondPop = Math.min(pop1, pop2);
                b.mesh.scale.setScalar(Math.max(0.001, bondPop * tEnt));
                b.mesh.visible = (bondPop * tEnt) > 0.01;
                
                const p1 = atomMeshes[b.a1].mesh.position;
                const p2 = atomMeshes[b.a2].mesh.position;
                const mid = p1.clone().add(p2).multiplyScalar(0.5);
                b.mesh.position.copy(mid);
                b.mesh.lookAt(p2);
                
                b.mesh.children.forEach(c => {
                    ((c as THREE.Mesh).material as THREE.Material).opacity = tEnt;
                });
            });
        };
        
        return { scene: s, camera, update };
    };

    const cam = render3D(ctx, key, rect, build, env.elapsedMs, { pops, tEnt });
    if (!cam) return;

    // Draw element labels in 2D
    struct.atoms.forEach((a, idx) => {
        const pop = pops[idx];
        if (pop <= 0) return;
        
        const pos = worldPos(a.x, a.y);
        const bob = Math.sin(env.elapsedMs / 1000 + idx) * 0.1;
        const pt = projectToRect(cam, pos.clone().setY(pos.y + bob * pop), rect);
        
        ctx.font = `700 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
        ctx.fillStyle = a.el === "H" ? "#000" : "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.el, pt.x, pt.y);
    });

    // Caption Banner
    if (activeStep?.say) {
      const bannerH = layout.unit * 1.6;
      const bannerY = areaY + areaH - bannerH - layout.unit * 0.4;
      const bannerW = areaW - layout.unit * 1.2;
      const bannerX = areaX + layout.unit * 0.6;

      roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
      ctx.fillStyle = rgba(THEME.panel, 0.92);
      ctx.fill();
      ctx.strokeStyle = palette.accentGlow;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(activeStep.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
    }
  }

  ctx.restore();
}
