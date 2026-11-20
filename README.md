# 🇫🇷 Phonétique Française - Correcteur et Espectro Fonético con IA

Aplicación interactiva de corrección fonética en francés con análisis de espectrograma en tiempo real, diagnóstico articulatorio 3D/sagital (lengua, labios, velo del paladar, acentuación y ritmo) impulsado por Google Gemini.

---

## 🚀 Características

- **Análisis Fonético con IA**: Diagnóstico anatómico en tiempo real evaluando la colocación de la lengua, apertura labial, velo del paladar y nasalidad.
- **Espectrograma y Formantes (F1 / F2)**: Visualización acústica en vivo de las frecuencias del habla para comparar la producción del estudiante con los formantes objetivo del francés estándar.
- **Síntesis de Voz Nativa (TTS)**: Generación de audio de referencia con pronunciación nativa parisina mediante Gemini TTS.
- **Guía Fonética Personalizada**: Generación dinámica de fichas articulatorias, transcripción AFI (IPA) y consejos musculares para cualquier palabra o frase en francés.

---

## 🛠️ Ejecución Local

### Prerrequisitos
- Node.js 18+ o 20+
- Clave de API de Google Gemini (`GEMINI_API_KEY`)

### Pasos
1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear un archivo `.env` en la raíz (basado en `.env.example`):
   ```env
   GEMINI_API_KEY="tu_clave_de_gemini"
   ```
3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abrir en el navegador en [http://localhost:3000](http://localhost:3000).

---

## 🌐 Despliegue en Vercel

La app está preconfigurada con `vercel.json` y una función serverless en `api/index.ts` para funcionar sin fricciones en Vercel.

1. Conecta tu repositorio de GitHub `danielvick-wq/app-frances` en [Vercel](https://vercel.com).
2. Framework Preset: **Vite** (detectado automáticamente).
3. Root Directory: `./`
4. En **Environment Variables**, añade:
   - `GEMINI_API_KEY`: tu API Key de Google Gemini.
5. Haz clic en **Deploy**. ¡Listo!
