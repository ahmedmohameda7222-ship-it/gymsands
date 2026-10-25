import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      // The disposable RPC transport declaration is TypeScript, while the
      // legacy JS-only lint parser cannot parse .d.mts grammar.
      "scripts/food-catalog-plan9-disposable-rpc-transport.d.mts",
    ],
  },
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
