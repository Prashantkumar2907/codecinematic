import * as THREE from "three";
import { render3D, projectToRect, studioLights, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
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
  shade,
  idle,
  easeOutBack,
  easeOutCubic,
  clamp01,
  beatT,
  activeBeatIndex,
  departT,
  STROKE,
} from "./common";

type MoleculeScene = Extract<Scene, { kind: "molecule" }>;

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

const IDLE_FACE_LIFT = 0.1;

export function paintMolecule(ctx: CanvasRenderingContext2D, scene: MoleculeScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { vertical } = layout;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 4);

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt * leave;

  // Header Title
  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);
  ctx.restore();

  const areaX = layout.contentX;
  const areaY = layout.contentY + layout.unit * 1.8;
  const areaW = layout.contentW;
  const areaH = layout.contentH - layout.unit * 2.8;
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  // Outer panel container
  ctx.save();
  ctx.globalAlpha = leave;
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = layout.unit * STROKE.hair;
  ctx.stroke();
  ctx.restore();

  const drawBanner = (text: string, alpha: number) => {
    if (alpha <= 0) return;
    const bannerH = layout.unit * 1.6;
    const bannerY = areaY + areaH - bannerH - layout.unit * 0.4;
    const bannerW = areaW - layout.unit * 1.2;
    const bannerX = areaX + layout.unit * 0.6;

    ctx.save();
    ctx.globalAlpha = alpha * leave;
    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = layout.unit * STROKE.thin;
    ctx.stroke();

    ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
    ctx.restore();
  };

  if (scene.mode === "equation" && scene.equation) {
    const eq = scene.equation;
    const offset = introBeatCount(scene);
    const totalBeats = offset + 3;
    const active = activeBeatIndex(env.beats, totalBeats, env.p);
    const stage = Math.min(2, Math.max(0, active - offset));
    const stageT = active >= offset ? beatT(env.beats, active, totalBeats, env.p) : 0;
    const sayList = [eq.sayLeft, eq.sayReact, eq.sayRight];
    const fade = easeOutCubic(clamp01(stageT / 0.2));

    const leftStr = eq.left.map((item) => `${item.count > 1 ? item.count : ""}${item.formula}`).join("  +  ");
    const rightStr = eq.right.map((item) => `${item.count > 1 ? item.count : ""}${item.formula}`).join("  +  ");

    const eqY = areaY + areaH * 0.42;
    const arrowX = areaX + areaW * 0.5;
    const reacting = stage === 1;
    const done = stage >= 2;
    const pulse = idle(env, 1200);

    // Reactants, drawn on a card so the active side reads as a distinct panel
    // rather than bare floating text.
    ctx.save();
    ctx.font = `700 ${Math.round(layout.unit * 1.1)}px ${FONT_MONO}`;
    const leftW = ctx.measureText(leftStr).width;
    const cardH = layout.unit * 1.6;
    const cardPad = layout.unit * 0.6;
    ctx.textAlign = "right";
    const leftX = areaX + areaW * 0.42;
    const isLeftFocus = stage === 0;
    // The focused side bobs a few px — a translucent fill breathing alone
    // was too subtle to register once its entrance settles (measured: this
    // stage was otherwise the only thing on screen for a third of the
    // scene). Moving the actual glyph edges is what a frame-diff can see.
    const leftBob = isLeftFocus ? Math.sin(env.elapsedMs / 900) * layout.unit * 0.08 : 0;
    const leftPulse = isLeftFocus ? 0.97 + 0.05 * pulse : 1;
    ctx.translate(leftX, eqY);
    ctx.scale(leftPulse, leftPulse);
    ctx.translate(-leftX, -eqY);
    if (!done) {
      const breathe = isLeftFocus ? 0.85 + 0.3 * pulse : 1;
      roundRect(ctx, leftX - leftW - cardPad, eqY - cardH / 2 + leftBob, leftW + cardPad * 2, cardH, layout.unit * 0.3);
      ctx.fillStyle = shade(THEME.panel, IDLE_FACE_LIFT);
      ctx.globalAlpha = leave * breathe;
      ctx.fill();
      ctx.globalAlpha = leave;
      if (!reacting) {
        ctx.strokeStyle = rgba(palette.accent, isLeftFocus ? 0.5 + 0.3 * pulse : 0.6);
        ctx.lineWidth = layout.unit * STROKE.thin;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = leave * (done ? 0.4 : 1);
    ctx.fillStyle = done ? THEME.textDim : palette.accent;
    ctx.fillText(leftStr, leftX, eqY + leftBob);
    ctx.restore();

    // Reaction Arrow — pulses continuously once reacting, glows when settled.
    ctx.save();
    ctx.globalAlpha = leave;
    ctx.font = `700 ${Math.round(layout.unit * 1.2)}px ${FONT_SANS}`;
    ctx.fillStyle = reacting ? palette.secondary : THEME.textDim;
    ctx.textAlign = "center";
    if (reacting) {
      ctx.shadowColor = palette.accentGlow;
      ctx.shadowBlur = layout.unit * (0.4 + 0.4 * pulse);
    }
    ctx.fillText("➔", arrowX, eqY - 2);
    ctx.shadowBlur = 0;
    ctx.restore();

    // A spark travels the arrow's span while reacting — the one moment two
    // static text blocks need something crossing between them to read as a
    // reaction rather than a slide transition.
    if (reacting) {
      const f = (env.elapsedMs % 900) / 900;
      const sparkX = arrowX - layout.unit * 1.1 + f * layout.unit * 2.2;
      ctx.save();
      ctx.globalAlpha = leave * Math.sin(Math.PI * f);
      ctx.shadowColor = palette.accentGlow;
      ctx.shadowBlur = layout.unit * 0.6;
      ctx.fillStyle = THEME.text;
      ctx.beginPath();
      ctx.arc(sparkX, eqY - layout.unit * 0.35, layout.unit * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Products — pop in once the reaction resolves.
    if (stage >= 1) {
      // Same glyph-edge bob as the reactant side once settled, for the same
      // reason: the settled product is the only thing left on screen. Also
      // breathes scale — a pure position bob measured too weak at 16:9 to
      // clear the diff threshold on its own.
      const donePulse = done ? 0.93 + 0.1 * pulse : 1;
      const pop = (stage >= 2 ? easeOutBack(fade) : 1) * donePulse;
      const rightBob = done ? Math.sin(env.elapsedMs / 900 + 1.7) * layout.unit * 0.15 : 0;
      ctx.save();
      ctx.font = `700 ${Math.round(layout.unit * 1.1)}px ${FONT_MONO}`;
      const rightW = ctx.measureText(rightStr).width;
      const rightX = areaX + areaW * 0.58;
      ctx.globalAlpha = leave * (done ? 1 : fade);
      ctx.translate(rightX + rightW / 2, eqY);
      ctx.scale(Math.max(0.001, pop), Math.max(0.001, pop));
      ctx.translate(-(rightX + rightW / 2), -eqY);
      if (done) {
        roundRect(ctx, rightX - cardPad, eqY - cardH / 2 + rightBob, rightW + cardPad * 2, cardH, layout.unit * 0.3);
        ctx.fillStyle = shade(THEME.panel, IDLE_FACE_LIFT);
        ctx.globalAlpha = leave * (0.85 + 0.3 * pulse);
        ctx.fill();
        ctx.globalAlpha = leave;
        ctx.strokeStyle = rgba(palette.secondary, 0.5 + 0.3 * pulse);
        ctx.lineWidth = layout.unit * STROKE.thin;
        ctx.stroke();
      }
      ctx.textAlign = "left";
      ctx.fillStyle = palette.secondary;
      ctx.fillText(rightStr, rightX, eqY + rightBob);
      ctx.restore();
    }

    // Caption Banner — crossfades between the two adjacent stages instead of
    // snapping, so no beat holds an already-stale line for its whole window.
    drawBanner(sayList[stage], 1);
    if (stage > 0 && fade < 1) drawBanner(sayList[stage - 1], 1 - fade);
  } else if (scene.mode === "structure" && scene.structure) {
    const struct = scene.structure;
    const offset = introBeatCount(scene);
    const totalBeats = offset + struct.steps.length;
    const active = activeBeatIndex(env.beats, totalBeats, env.p);
    const activeStepIdx = Math.min(struct.steps.length - 1, Math.max(0, active - offset));
    const activeStep = struct.steps[activeStepIdx];

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

        const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(palette.accent), new THREE.Color(shade(THEME.panel, 0.3)));
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

            const bondColor = THEME.textDim;
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

        const camDist = vertical ? 10 : 8;
        const camY = vertical ? 12 : 10;
        const update = (elapsedMs: number, ctxData: { pops: number[], tEnt: number, leave: number }) => {
            const { pops, tEnt, leave } = ctxData;

            // A slow camera orbit is the only thing keeping the whole structure
            // visibly alive once every atom has finished popping in — the
            // per-atom bob alone was too small a fraction of the frame to
            // register once the entrance settles. The 2D atom labels below
            // project through this same (mutated) camera, so they track the
            // sway automatically rather than drifting off their spheres.
            const sway = Math.sin(elapsedMs / 5000) * 0.16;
            camera.position.set(Math.sin(sway) * camDist, camY, Math.cos(sway) * camDist);
            camera.lookAt(0, 0, 0);

            atomMeshes.forEach((a, i) => {
                const pop = pops[i] ?? 0;
                a.mesh.scale.setScalar(Math.max(0.001, pop * tEnt));
                const bob = Math.sin(elapsedMs / 1000 + i) * 0.1;
                a.mesh.position.y = a.startPos.y + bob * pop;
                a.mesh.visible = (pop * tEnt) > 0.01;
                (a.mesh.material as THREE.MeshPhysicalMaterial).opacity = tEnt * leave;
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
                    ((c as THREE.Mesh).material as THREE.Material).opacity = tEnt * leave;
                });
            });
        };

        return { scene: s, camera, update };
    };

    const cam = render3D(ctx, key, rect, build, env.elapsedMs, { pops, tEnt, leave });
    if (!cam) return;

    // Draw element labels in 2D
    struct.atoms.forEach((a, idx) => {
        const pop = pops[idx];
        if (pop <= 0) return;

        const pos = worldPos(a.x, a.y);
        const bob = Math.sin(env.elapsedMs / 1000 + idx) * 0.1;
        const pt = projectToRect(cam, pos.clone().setY(pos.y + bob * pop), rect);

        ctx.save();
        ctx.globalAlpha = tEnt * leave;
        ctx.font = `700 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
        ctx.fillStyle = a.el === "H" ? THEME.bgBottom : THEME.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.el, pt.x, pt.y);
        ctx.restore();
    });

    drawBanner(activeStep?.say ?? "", 1);
  }
}
