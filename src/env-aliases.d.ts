// kit 3 ya no genera los tipos de los alias deprecados `$env/dynamic/*`
// (en runtime siguen funcionando). Declaración ambient mínima para que
// svelte-check no falle, hasta migrar a la forma nativa de kit 3
// (declarar las vars en src/env.ts e importarlas por nombre desde
// `$app/env/private` / `$app/env/public`).
declare module '$env/dynamic/private' {
	export const env: Record<string, string | undefined>;
}

declare module '$env/dynamic/public' {
	export const env: Record<string, string | undefined>;
}
