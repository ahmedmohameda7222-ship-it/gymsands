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
      // The controller intentionally keys cache writes by user ID rather than
      // the wider auth object identity. The callback does not read other user fields.
      "react-hooks/preserve-manual-memoization": "off"
    }
  }
];

export default eslintConfig;
