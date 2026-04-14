import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        ignores: [
            "node_modules/**",
            ".next/**",
            "out/**",
            "build/**",
            "next-env.d.ts",
        ],
    },
    {
        // Add this rules object to override the strict defaults
        rules: {
            // Disables the error for using 'any' types
            "@typescript-eslint/no-explicit-any": "off",
            
            // Disables the error for constructor interfaces
            "@typescript-eslint/no-misused-new": "off",
            
            // Downgrades unused variables from an error to a warning (or set to "off")
            "@typescript-eslint/no-unused-vars": "warn",
            
            // Downgrades the missing dependency warning in useEffects
            "react-hooks/exhaustive-deps": "off"
        }
    }
];

export default eslintConfig;