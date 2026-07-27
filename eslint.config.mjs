import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**"]
  },
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off"
    }
  },
  {
    files: ["components/workouts/active-workout/active-workout-core-session.tsx"],
    rules: {
      // These refs deliberately carry the latest presentation payload into stable
      // primitive-identity effects. They are never read to produce rendered output.
      "react-hooks/refs": "off"
    }
  }
];

export default eslintConfig;
