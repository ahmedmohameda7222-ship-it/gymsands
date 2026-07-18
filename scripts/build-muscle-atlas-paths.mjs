import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("assets/muscle-intelligence/advanced-visible-v1/source");
const outputRoot = path.resolve("data/muscle-intelligence/advanced-visible-v1");

const assignments = {
  front: [
    "excluded:background", "oblique.external_upper:right", "pectoralis.upper:right", "pectoralis.middle:right",
    "pectoralis.lower:right", "pectoralis.outer:right", "pectoralis.lower:right", "pectoralis.outer:right",
    "pectoralis.upper:right", "deltoid.anterior:right", "deltoid.lateral:right", "neck.sternocleidomastoid:right",
    "neck.sternocleidomastoid:right", "trapezius.upper:right", "rectus_abdominis.upper:center",
    "rectus_abdominis.upper:right", "rectus_abdominis.lower:left", "rectus_abdominis.middle:left",
    "rectus_abdominis.middle:right", "excluded:neutral_tendon", "excluded:neutral_tendon", "oblique.external_upper:right",
    "oblique.external_lower:right", "serratus.anterior:right", "serratus.anterior:right", "serratus.anterior:right",
    "serratus.anterior:right", "serratus.anterior:right", "hip_flexors.anterior:left", "rectus_abdominis.lower:right",
    "excluded:neutral_tendon", "quadriceps.rectus_femoris:left", "quadriceps.vastus_medialis:left",
    "adductors.anterior_region:right", "adductors.anterior_region:left", "hip_flexors.anterior:left",
    "tensor_fasciae_latae:left", "quadriceps.vastus_lateralis:left", "quadriceps.vastus_lateralis:left",
    "quadriceps.vastus_lateralis:left", "quadriceps.vastus_lateralis:left", "quadriceps.rectus_femoris:right",
    "quadriceps.vastus_medialis:right", "adductors.anterior_region:right", "adductors.anterior_region:right",
    "hip_flexors.anterior:right", "tensor_fasciae_latae:right", "quadriceps.vastus_lateralis:right",
    "quadriceps.vastus_lateralis:right", "quadriceps.vastus_lateralis:right", "pectoralis.upper:left",
    "pectoralis.middle:left", "pectoralis.lower:left", "pectoralis.lower:left", "pectoralis.outer:left",
    "pectoralis.upper:left", "deltoid.anterior:left", "deltoid.lateral:left", "trapezius.upper:left",
    "neck.sternocleidomastoid:left", "neck.sternocleidomastoid:left", "neck.sternocleidomastoid:center",
    "lower_leg.fibularis:right", "lower_leg.tibialis_anterior:right", "lower_leg.fibularis:right",
    "excluded:neutral_knee", "excluded:neutral_knee", "excluded:neutral_knee", "lower_leg.tibialis_anterior:right",
    "lower_leg.tibialis_anterior:right", "lower_leg.tibialis_anterior:right", "excluded:neutral_tendon",
    "excluded:neutral_knee", "excluded:neutral_knee", "lower_leg.fibularis:left", "lower_leg.tibialis_anterior:left",
    "lower_leg.fibularis:left", "excluded:neutral_knee", "excluded:neutral_knee", "excluded:neutral_knee",
    "excluded:neutral_tendon", "lower_leg.tibialis_anterior:left", "excluded:neutral_knee",
    "forearm.flexor_mass:right", "biceps.long_head:right", "biceps.short_head:right", "forearm.flexor_mass:right",
    "brachialis:right", "brachialis:right", "brachialis:right", "brachialis:right", "brachioradialis:right",
    "forearm.pronator_teres:right", "forearm.pronator_teres:right", "forearm.pronator_teres:right",
    "forearm.flexor_mass:right", "forearm.flexor_mass:right", "forearm.flexor_mass:left", "biceps.long_head:left",
    "biceps.short_head:left", "forearm.flexor_mass:left", "brachialis:left", "biceps.short_head:left",
    "brachioradialis:left", "forearm.pronator_teres:left", "forearm.pronator_teres:left", "forearm.flexor_mass:left",
    "excluded:neutral_head", "neck.sternocleidomastoid:center", "neck.sternocleidomastoid:left",
    "neck.sternocleidomastoid:left", "excluded:neutral_tendon", "oblique.external_upper:left",
    "oblique.external_lower:left", "serratus.anterior:left", "serratus.anterior:left", "serratus.anterior:left",
    "excluded:neutral_hand", "excluded:neutral_hand", "excluded:neutral_hand", "excluded:neutral_hand",
    "excluded:neutral_hand", "excluded:neutral_hand", "excluded:neutral_hand", "excluded:neutral_hand",
    "excluded:neutral_foot", "excluded:neutral_foot", "excluded:neutral_gap"
  ],
  back: [
    "excluded:background", "deltoid.posterior:center", "deltoid.posterior:right", "latissimus.middle:right",
    "latissimus.lower:right", "teres_major:right", "teres_minor:right", "trapezius.middle:right",
    "latissimus.upper:right", "infraspinatus:right", "teres_minor:right", "gluteus.medius:left",
    "latissimus.lower:left", "latissimus.outer:left", "latissimus.outer:left", "gluteus_maximus.upper:left",
    "gluteus_maximus.lower:left", "spinal_erectors.lower:center", "spinal_erectors.upper:right",
    "spinal_erectors.upper:right", "spinal_erectors.upper:left", "spinal_erectors.upper:center",
    "latissimus.middle:left", "latissimus.lower:left", "latissimus.outer:left", "latissimus.upper:left",
    "excluded:neutral_head", "trapezius.lower:center", "trapezius.upper:right", "trapezius.upper:left",
    "trapezius.upper:center", "trapezius.upper:center", "trapezius.middle:left", "teres_major:left",
    "infraspinatus:left", "teres_minor:left", "gluteus_maximus.middle:right", "gluteus.medius:right",
    "latissimus.lower:right", "latissimus.outer:right", "latissimus.outer:right", "latissimus.outer:right",
    "gluteus_maximus.upper:right", "gluteus_maximus.lower:right", "hamstrings.biceps_femoris_long_head:right",
    "hamstrings.biceps_femoris_short_head:right", "hamstrings.biceps_femoris_short_head:right",
    "adductors.posterior_region:right", "hamstrings.semitendinosus:right", "hamstrings.semitendinosus:right",
    "hamstrings.semimembranosus:right", "excluded:neutral_knee", "hamstrings.semimembranosus:right",
    "gluteus.medius:left", "hamstrings.biceps_femoris_long_head:left", "hamstrings.biceps_femoris_short_head:left",
    "adductors.posterior_region:left", "hamstrings.semitendinosus:left", "hamstrings.semimembranosus:left",
    "excluded:neutral_knee", "calf.gastrocnemius_medial:left", "excluded:neutral_foot",
    "calf.soleus:left", "calf.soleus:left", "calf.soleus:left", "calf.soleus:left", "calf.soleus:left",
    "excluded:neutral_gap", "calf.gastrocnemius_lateral:left", "forearm.extensor_mass:left",
    "triceps.long_head:left", "triceps.medial_head:left", "triceps.lateral_head:left", "triceps.lateral_head:left",
    "brachioradialis:left", "forearm.extensor_mass:left", "forearm.extensor_mass:right", "triceps.long_head:right",
    "triceps.medial_head:right", "triceps.lateral_head:right", "triceps.lateral_head:right", "brachioradialis:right",
    "forearm.extensor_mass:right", "excluded:neutral_foot", "calf.soleus:right", "calf.soleus:right",
    "calf.soleus:right", "excluded:neutral_hand", "excluded:neutral_hand", "calf.gastrocnemius_medial:right",
    "calf.gastrocnemius_lateral:right", "calf.soleus:right"
  ]
};

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizedPathData(d) {
  let coordinateIndex = 0;
  return d.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, (token) => {
    const scale = coordinateIndex++ % 2 === 0 ? 0.25 : 0.375;
    return String(Number((Number(token) * scale).toFixed(4)));
  });
}

function parseSvg(content, view) {
  const paths = [...content.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/g)].map((match) => match[1]);
  if (paths.length !== assignments[view].length) {
    throw new Error(`${view} expected ${assignments[view].length} paths, received ${paths.length}.`);
  }
  return paths.map((d, index) => {
    const sourcePathId = `${view}-path-${String(index + 1).padStart(3, "0")}`;
    const classification = assignments[view][index];
    if (classification.startsWith("excluded:")) {
      return { sourcePathId, view, classification: "excluded", reason: classification.slice(9), normalizedPathData: normalizedPathData(d) };
    }
    const separator = classification.lastIndexOf(":");
    return {
      sourcePathId,
      view,
      classification: "target",
      canonicalId: classification.slice(0, separator),
      side: classification.slice(separator + 1),
      normalizedPathData: normalizedPathData(d)
    };
  });
}

await mkdir(outputRoot, { recursive: true });
const views = {};
for (const view of ["front", "back"]) {
  const filename = `muscle-mask-${view}.svg`;
  const content = await readFile(path.join(sourceRoot, filename), "utf8");
  views[view] = {
    sourceFile: filename,
    sourceSha256: hash(content),
    sourcePathCount: assignments[view].length,
    paths: parseSvg(content, view)
  };
}

const hitAreas = [
  { id: "hit-front-serratus-anterior-left", view: "front", canonicalId: "serratus.anterior", side: "left", cx: 640, cy: 530, rx: 26, ry: 52 },
  { id: "hit-back-teres-minor-left", view: "back", canonicalId: "teres_minor", side: "left", cx: 342, cy: 330, rx: 24, ry: 20 },
  { id: "hit-front-forearm-pronator-teres-right", view: "front", canonicalId: "forearm.pronator_teres", side: "right", cx: 282, cy: 540, rx: 24, ry: 30 },
  { id: "hit-front-tensor-fasciae-latae-left", view: "front", canonicalId: "tensor_fasciae_latae", side: "left", cx: 620, cy: 680, rx: 24, ry: 38 },
  { id: "hit-back-triceps-medial-head-right", view: "back", canonicalId: "triceps.medial_head", side: "right", cx: 700, cy: 500, rx: 25, ry: 42 },
  { id: "hit-front-quadriceps-vastus-medialis-left", view: "front", canonicalId: "quadriceps.vastus_medialis", side: "left", cx: 555, cy: 970, rx: 30, ry: 40 }
];

const manifest = {
  schemaVersion: "advanced_visible_v1_source_path_assignments_v1",
  logicalCanvas: { viewBox: "0 0 1024 1536", width: 1024, height: 1536, aspectRatio: "2:3" },
  normalization: { sourceViewBox: "0 0 4096 4096", xScale: 0.25, yScale: 0.375 },
  views,
  hitAreas
};
await writeFile(path.join(outputRoot, "source-path-assignments.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const sideOrder = new Map([["left", 0], ["right", 1], ["center", 2]]);
const targetViews = ["front", "back"].flatMap((view) => {
  const targetIds = [...new Set(views[view].paths.flatMap((entry) => entry.classification === "target" ? [entry.canonicalId] : []))].sort();
  return targetIds.map((canonicalId) => ({
    canonicalId,
    view,
    sides: [...new Set(views[view].paths.flatMap((entry) => entry.classification === "target" && entry.canonicalId === canonicalId ? [entry.side] : []))]
      .sort((left, right) => sideOrder.get(left) - sideOrder.get(right)),
    hitAreaIds: hitAreas.filter((area) => area.view === view && area.canonicalId === canonicalId).map((area) => area.id).sort()
  }));
});
await writeFile(path.join(outputRoot, "target-view-registry.json"), `${JSON.stringify({
  schemaVersion: "advanced_visible_v1_target_view_registry_v1",
  targetViews
}, null, 2)}\n`, "utf8");
