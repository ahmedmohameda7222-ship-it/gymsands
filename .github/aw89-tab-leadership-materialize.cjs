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

function replaceAllExact(path, before, after, expectedCount) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} replacement targets, found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
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
replaceAllExact(
  corePath,
  `              onClick={() => {
                setTabLeader(tabLeadershipRef.current?.acquire(true) ?? true);
              }}`,
  `              onClick={() => {
                const leadership = tabLeadershipRef.current;
                if (!leadership) return;
                void leadership.acquire(true).then(setTabLeader);
              }}`,
  2,
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
