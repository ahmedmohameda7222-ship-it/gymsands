from pathlib import Path

path = Path("scripts/train-layout-qa-fixture.mjs")
text = path.read_text()
anchor = '''  const meta = { source: "external", degraded: false, catalogVersion: "v1", locale: "en" };\n'''
if text.count(anchor) != 1:
    raise SystemExit(f"AW5 catalog meta anchor drifted: {text.count(anchor)}")

native = r'''  const libraryMeta = {
    apiVersion: "v2",
    locale: url.searchParams.get("locale") || "en",
    libraryRelease: {
      id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
      version: "p10e-library-v1",
      checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
      publishedAt: "2026-08-11T20:46:59.000Z",
      strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
    },
    catalogRelease: {
      id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
      version: "p10e-library-v1",
      checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
    },
    source: "library_v2",
    degraded: false
  };
  const revisionId = "66666666-6666-4666-8666-000000000001";
  const nativeActivity = {
    id: activity.id,
    revisionId,
    revisionNumber: activity.version,
    revisionLifecycle: "published",
    revisionChecksum: null,
    slug: activity.slug,
    name: activity.name,
    shortDescription: activity.shortDescription,
    instructions: activity.instructions,
    difficulty: activity.difficulty,
    movementPattern: activity.movementPattern,
    activityType: { slug: "strength", name: "Strength" },
    membership: {
      kind: "owned",
      visibility: "default",
      domainPriority: 1,
      primaryDomain: true
    },
    aliases: [],
    equipment: activity.equipment.map((equipment) => ({
      slug: equipment.slug,
      name: equipment.name,
      requirement: equipment.isRequired ? "required" : "optional"
    })),
    coverage: activity.muscles.map((muscle) => ({
      name: muscle.name,
      muscleName: muscle.name,
      role: muscle.role,
      bodyRegion: "Lower Body",
      broadGroup: "Lower Body"
    })),
    executionProfiles: [{
      filterProfile: {
        difficulty: activity.difficulty,
        movementFamily: activity.movementPattern
      }
    }],
    bodyEffects: [],
    guideUrl: activity.guideUrl,
    videoUrl: activity.videoUrl
  };
  const nativeDetail = {
    ...nativeActivity,
    prescriptionSchema: {
      id: "77777777-7777-4777-8777-777777777777",
      key: "resistance_sets",
      version: 1,
      checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fields: []
    },
    performedMetricSchema: null,
    recordDefinitions: [],
    heatMap: {
      mapping: activity.muscles.map((muscle) => ({
        muscleName: muscle.name,
        role: muscle.role,
        broadGroup: "Lower Body"
      }))
    },
    publicationPolicy: {
      id: "88888888-8888-4888-8888-888888888888",
      key: "published_library",
      version: 1,
      checksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    capabilityContract: {
      id: "99999999-9999-4999-8999-999999999999",
      version: "main-activity-catalog-v2-capability-v2",
      compatibleCatalogApiVersion: "v2",
      checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    authority: {
      libraryRelease: {
        id: libraryMeta.libraryRelease.id,
        version: libraryMeta.libraryRelease.version,
        checksum: libraryMeta.libraryRelease.checksum
      },
      catalogRelease: {
        id: libraryMeta.catalogRelease.id,
        version: libraryMeta.catalogRelease.version,
        checksum: libraryMeta.catalogRelease.checksum
      },
      activityId: activity.id,
      revisionId,
      revisionNumber: activity.version
    }
  };
  const libraryDomainPath = "/api/activity-catalog/library-domains/strength";
  if (url.pathname === `${libraryDomainPath}/filters`) {
    return { data: [], meta: libraryMeta };
  }
  if (url.pathname === `${libraryDomainPath}/archetypes`) {
    return { data: [], meta: libraryMeta };
  }
  if (url.pathname === `${libraryDomainPath}/activities`) {
    return {
      data: [nativeActivity],
      pagination: {
        limit: Math.min(Number(url.searchParams.get("limit") || 50), 50),
        returned: 1,
        nextCursor: null
      },
      meta: libraryMeta
    };
  }
  if (url.pathname.startsWith(`${libraryDomainPath}/activities/`)) {
    if (url.pathname.endsWith("/alternatives")) {
      return { data: [], meta: libraryMeta };
    }
    return { data: nativeDetail, meta: libraryMeta };
  }

  const meta = { source: "external", degraded: false, catalogVersion: "v1", locale: "en" };
'''

text = text.replace(anchor, native, 1)
path.write_text(text)
