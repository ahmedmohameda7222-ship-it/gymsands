const { readFileSync, writeFileSync } = require("node:fs");

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one replacement target`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const corePath =
  "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
replaceOnce(
  corePath,
  "  const [tabLeader, setTabLeader] = useState(true);",
  "  const [tabLeader, setTabLeader] = useState(false);",
);
replaceOnce(
  corePath,
  `    tabLeadershipRef.current = leadership;
    setTabLeader(leadership.acquire());
    const unsubscribe = leadership.subscribe(setTabLeader);
    const renew = () => {
      if (leadership.isLeader()) leadership.renew();
    };
    const acquireOnFocus = () => setTabLeader(leadership.acquire());`,
  `    tabLeadershipRef.current = leadership;
    void leadership.acquire().then(setTabLeader);
    const unsubscribe = leadership.subscribe(setTabLeader);
    const renew = () => {
      if (leadership.isLeader()) leadership.renew();
    };
    const acquireOnFocus = () => {
      void leadership.acquire().then(setTabLeader);
    };`,
);
replaceOnce(
  corePath,
  `      leadership.release();
      if (tabLeadershipRef.current === leadership)
        tabLeadershipRef.current = null;`,
  `      leadership.dispose();
      if (tabLeadershipRef.current === leadership)
        tabLeadershipRef.current = null;`,
);
replaceOnce(
  corePath,
  `              onClick={() => {
                setTabLeader(tabLeadershipRef.current?.acquire(true) ?? true);
              }}`,
  `              onClick={() => {
                const leadership = tabLeadershipRef.current;
                if (!leadership) return;
                void leadership.acquire(true).then(setTabLeader);
              }}`,
);
replaceOnce(
  corePath,
  `            onClick={() => {
              setTabLeader(tabLeadershipRef.current?.acquire(true) ?? true);
            }}`,
  `            onClick={() => {
              const leadership = tabLeadershipRef.current;
              if (!leadership) return;
              void leadership.acquire(true).then(setTabLeader);
            }}`,
);

const offlineContractPath =
  "lib/product/active-workout-aw9-offline-contract.test.ts";
replaceOnce(
  offlineContractPath,
  `    expect(fallbackLease).toContain("if (isOwned()) input.storage.removeItem");`,
  `    expect(fallbackLease).toContain("if (!isOwned()) return");
    expect(fallbackLease).toContain("input.storage.removeItem(input.key)");`,
);

const identityTestPath =
  "components/workouts/active-workout/active-workout-core-session.identity.test.tsx";
replaceOnce(
  identityTestPath,
  `vi.mock("@/lib/workouts/active-session-store/store", () => ({
  getActiveSessionStore: () => ({
    hydrate,
    getSnapshot,
    subscribe: () => () => undefined,
    dispatch,
    saveCanonicalSets: vi.fn(),
    completeCanonicalSet: vi.fn(),
    completeSession,
    skipExercise: vi.fn(),
    replaceExercise: vi.fn(),
    cancelSession: vi.fn(),
    retryPendingTransport: vi.fn(),
    resolveConflict: vi.fn(),
    setSecondaryProjection: vi.fn()
  })
}));
vi.mock("@/services/database/active-session-persistence-adapter", () => ({`,
  `vi.mock("@/lib/workouts/active-session-store/store", () => ({
  getActiveSessionStore: () => ({
    hydrate,
    getSnapshot,
    subscribe: () => () => undefined,
    dispatch,
    saveCanonicalSets: vi.fn(),
    completeCanonicalSet: vi.fn(),
    completeSession,
    skipExercise: vi.fn(),
    replaceExercise: vi.fn(),
    cancelSession: vi.fn(),
    retryPendingTransport: vi.fn(),
    resolveConflict: vi.fn(),
    setSecondaryProjection: vi.fn()
  })
}));
vi.mock("@/lib/workouts/active-session-sync", () => ({
  createActiveWorkoutTabLeadership: () => ({
    tabId: "tab-1",
    isLeader: () => true,
    acquire: async () => true,
    renew: () => true,
    release: () => undefined,
    dispose: () => undefined,
    subscribe: (listener: (leader: boolean) => void) => {
      listener(true);
      return () => undefined;
    }
  })
}));
vi.mock("@/services/database/active-session-persistence-adapter", () => ({`,
);

const packagePath = "package.json";
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const scriptName = "test:active-workout:aw8-aw10";
const leadershipTest = "lib/workouts/active-session-sync/leadership.test.ts";
if (!packageJson.scripts?.[scriptName]) {
  throw new Error(`Missing ${scriptName} script.`);
}
if (!packageJson.scripts[scriptName].includes(leadershipTest)) {
  packageJson.scripts[scriptName] = packageJson.scripts[scriptName].replace(
    "lib/workouts/active-session-sync/fallback-lease.test.ts",
    `lib/workouts/active-session-sync/fallback-lease.test.ts ${leadershipTest}`,
  );
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
