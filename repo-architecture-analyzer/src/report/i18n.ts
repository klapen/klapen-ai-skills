import * as d3 from "d3";

export type Lang = "en" | "es";

export const LANGS: Lang[] = ["en", "es"];

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "es";
}

/** Locale-aware number/percent formatters. Spanish uses "." for thousands and "," for decimals. */
const esLocale = d3.formatLocale({
  decimal: ",",
  thousands: ".",
  grouping: [3],
  currency: ["", " €"],
});

export function formatters(lang: Lang): { N: (n: number) => string; P: (n: number) => string } {
  return lang === "es" ? { N: esLocale.format(","), P: esLocale.format(".0%") } : { N: d3.format(","), P: d3.format(".0%") };
}

interface Dict {
  htmlLang: string;
  eyebrow: string;
  titleSuffix: string;
  dirtyWorktree: string;
  cleanWorktree: string;
  generated: string;
  utc: string;
  analyzer: string;
  langToggleLabel: string;

  snapshot: {
    title: string;
    lede: string;
    files: string;
    loc: string;
    sourceFiles: string;
    symbols: string;
    importEdges: string;
    cycles: string;
    violations: string;
    parsed: string;
    callout: (testPct: string, testCount: string, fileCount: string, skipped: string, failed: string) => string;
  };
  summary: {
    title: string;
    lede: string;
    keyInsights: string;
  };
  composition: {
    title: string;
    subtitle: (modules: string, types: string) => string;
    lede: string;
    locByCategory: string;
    categoryAll: string;
    categoryCode: string;
    categoryDocs: string;
    categoryAssets: string;
    filterHint: string;
    locByModule: string;
    locByFileType: string;
    filesSuffix: string;
    noFilesInCategory: string;
    categoryCallout: (codePct: string, docsPct: string, assetsPct: string) => string;
    callout: (topModule: string, pct: string, loc: string, files: string, top3Pct: string, depth: number) => string;
  };
  map: {
    title: string;
    subtitle: string;
    lede: string;
    callout: (path: string, loc: string, pct: string) => string;
  };
  graph: {
    title: string;
    subtitle: (edges: string) => string;
    lede: string;
    callout: (connected: string, total: string, orphans: string, examples: string) => string;
    legendCycle: string;
    hint: string;
  };
  coupling: {
    title: string;
    subtitle: (n: number) => string;
    lede: string;
    rows: string;
    cols: string;
    allModules: string;
    caption: string;
    fanInHeading: string;
    fanOutHeading: string;
    cyclesHeading: string;
    noCycles: string;
    col: { file: string; module: string; in: string; out: string; instab: string };
    callout: (hubPath: string, hubIn: number, hubPct: string, spokePath: string, spokeOut: number) => string;
  };
  hidden: {
    title: string;
    subtitle: (n: number) => string;
    lede: string;
    col: { fileA: string; fileB: string; commitsTogether: string; confidence: string };
    callout: (a: string, b: string, weight: number, confidence: string) => string;
    none: string;
  };
  risk: {
    title: string;
    subtitle: (n: number) => string;
    lede: string;
    caption: string;
    heading: string;
    col: { file: string; risk: string; cx: string; churn: string; loc: string; commits: string };
    callout: (path: string, score: number, cx: number, churn: string, commits: number) => string;
    notAlarming: string;
    axisChurn: string;
    axisComplexity: string;
  };
  history: {
    title: string;
    subtitle: (churn: string) => string;
    lede: string;
    churnByModule: string;
    mostChanged: string;
    recentlyModified: string;
    col: { file: string; churn: string; commits: string; module: string; modified: string; contributors: string };
    callout: (module: string, maxContrib: number, plural: boolean) => string;
  };
  symbols: {
    title: string;
    subtitle: (n: string) => string;
    lede: string;
    byKind: string;
    filesWithMost: string;
    mostComplex: string;
    col: { symbol: string; kind: string; file: string; cx: string; loc: string };
    callout: (name: string, file: string, cx: number, loc: number) => string;
  };
  reading: {
    title: string;
    lede: string;
  };
  footer: {
    schema: string;
    analyzer: string;
    config: string;
  };
  tip: {
    loc: string;
    risk: string;
    fanIn: string;
    fanOut: string;
    in: string;
    out: string;
    files: string;
    imports: string;
    partOfCycle: string;
    churn: string;
    cx: string;
  };
  empty: {
    repoMapUnavailable: string;
    noConnectedGraph: string;
    noConnectedMatrix: string;
    noMatrixMatch: string;
    noHotspotData: string;
  };
}

const en: Dict = {
  htmlLang: "en",
  eyebrow: "Repository architecture report",
  titleSuffix: "Repository Report",
  dirtyWorktree: "dirty worktree",
  cleanWorktree: "clean worktree",
  generated: "generated",
  utc: "UTC",
  analyzer: "analyzer",
  langToggleLabel: "Language",

  snapshot: {
    title: "Snapshot",
    lede: "Eight numbers that place the repository: how much code there is, how much of it the parser could read, and how tangled it is. Use it as the baseline for the next run — a rising cycle or violation count is the signal worth acting on.",
    files: "files",
    loc: "lines of code",
    sourceFiles: "source files",
    symbols: "symbols",
    importEdges: "import edges",
    cycles: "cycles",
    violations: "violations",
    parsed: "parsed",
    callout: (testPct, testCount, fileCount, skipped, failed) =>
      `${testPct} of files are tests (${testCount} of ${fileCount}). The parser skipped ${skipped} files — config, docs and generated output rather than source — and failed on ${failed}.`,
  },
  summary: {
    title: "Executive summary",
    lede: "A written read of this run, generated alongside the metrics. Everything below is the evidence behind it.",
    keyInsights: "Key insights",
  },
  composition: {
    title: "Composition",
    subtitle: (modules, types) => `${modules} modules · ${types} file types`,
    lede: "<b>What this is:</b> where the lines actually live — by category (code, documentation, assets), by module (top two path segments), and by file type. <b>How to read it:</b> the category split shows how much of the repository is actually source you'd read as code; the top bar is where most of your reading time will go; a module with many files but few lines is usually config or fixtures, and an unexpected file type is worth a look.",
    locByCategory: "Lines of code by category",
    categoryAll: "All",
    categoryCode: "Code",
    categoryDocs: "Documentation",
    categoryAssets: "Assets",
    filterHint: "Filter the module and file-type breakdown below to one category.",
    locByModule: "Lines of code by module",
    locByFileType: "Lines of code by file type",
    filesSuffix: "files",
    noFilesInCategory: "No files in this category.",
    categoryCallout: (codePct, docsPct, assetsPct) =>
      `${codePct} of this repository is actual code, ${docsPct} is documentation, and ${assetsPct} is assets and other non-code files.`,
    callout: (topModule, pct, loc, files, top3Pct, depth) =>
      `<b>${topModule}</b> holds ${pct} of all code (${loc} lines in ${files} files); the top three modules are ${top3Pct} of the repository. Directories nest ${depth} levels deep.`,
  },
  map: {
    title: "Repo map",
    subtitle: "treemap, area = lines of code",
    lede: "<b>What this is:</b> every file as a rectangle nested inside its folder, area proportional to lines of code. <b>How to read it:</b> scan for the few large rectangles — they dominate the codebase and are where refactoring pays off; a folder that is one giant rectangle plus crumbs usually wants splitting. Hover for metrics.",
    callout: (path, loc, pct) => `Largest single file: <b>${path}</b> at ${loc} lines — ${pct} of the repository on its own.`,
  },
  graph: {
    title: "Dependency graph",
    subtitle: (edges) => `${edges} import edges`,
    lede: "<b>What this is:</b> each connected source file is a circle (area = lines of code, colour = module), each arrow an import. Files with no imports either way are left out so the shape stays readable. <b>How to read it:</b> circles everything points at are shared foundations — change them carefully; circles with many outgoing arrows are orchestrators and the natural place to start reading. Click a node to isolate its neighbourhood — click it again, or click empty space, to clear. Drag to pan; hold Ctrl (Windows/Linux) or Cmd (Mac) and scroll to zoom, so scrolling the page still works over the chart. Red outlines mark files in an import cycle.",
    callout: (connected, total, orphans, examples) =>
      `${connected} of ${total} source files take part in the import graph; ${orphans} import nothing and are imported by nothing${
        examples ? ` (e.g. ${examples})` : ""
      } — usually entry points, scripts, or dead code worth checking.`,
    legendCycle: "in a cycle",
    hint: "click a node to isolate its neighbourhood · ⌃ Ctrl / ⌘ Cmd + scroll to zoom · drag to pan",
  },
  coupling: {
    title: "Coupling & cycles",
    subtitle: (n) => `${n} cycle${n === 1 ? "" : "s"}`,
    lede: "<b>What this is:</b> the same imports as a matrix — a mark at row → column means the row file imports the column file. <b>How to read it:</b> a dense column is a hub everything depends on; a dense row is a file that depends on everything. Marks mirrored across the diagonal for one pair are a cycle (red) and should be broken. Click a row or column label to trace everything it touches, or click a cell to isolate that one row/column intersection — click again, or click the empty background, to clear. The tables rank what the matrix points at.",
    rows: "Rows",
    cols: "Columns",
    allModules: "All modules",
    caption: "Ordered by path, so folders appear as blocks. Filter rows/columns to a module, click a label or cell to highlight, hover a cell for the pair.",
    fanInHeading: "Most depended on · fan-in",
    fanOutHeading: "Depends on most · fan-out",
    cyclesHeading: "Cycles",
    noCycles: "No import cycles detected.",
    col: { file: "file", module: "module", in: "in", out: "out", instab: "instab." },
    callout: (hubPath, hubIn, hubPct, spokePath, spokeOut) =>
      `Highest fan-in is <b>${hubPath}</b> with ${hubIn} dependents — a change there touches ${hubPct} of the connected graph. Highest fan-out is <b>${spokePath}</b> with ${spokeOut} dependencies: the orchestration point.`,
  },
  hidden: {
    title: "Hidden coupling",
    subtitle: (n) => `${n} pair${n === 1 ? "" : "s"}`,
    lede: "<b>What this is:</b> pairs of files repeatedly committed together that have no import between them — coupling git can see and the compiler cannot. <b>How to read it:</b> high-confidence pairs are candidates for a shared abstraction or a moved responsibility, and they are the pairs most likely to break each other during a refactor.",
    col: { fileA: "file a", fileB: "file b", commitsTogether: "commits together", confidence: "confidence" },
    callout: (a, b, weight, confidence) =>
      `Strongest pair: <b>${a}</b> and <b>${b}</b> — changed together ${weight} times at ${confidence} confidence with no import between them.`,
    none: "Every co-change pair is also an import — no hidden coupling detected.",
  },
  risk: {
    title: "Risk & hotspots",
    subtitle: (n) => `${n} files scored`,
    lede: "<b>What this is:</b> churn (lines changed across git history) against complexity; bubble area = file size, colour = risk score. <b>How to read it:</b> the top-right quadrant is the danger zone — complex code that also changes constantly, the classic refactor target. Bottom-right is churny but simple (healthy). Top-left is complex but stable (leave alone unless you must touch it).",
    caption: "Every file with git history is plotted; the six highest-risk files are labelled.",
    heading: "Highest risk files",
    col: { file: "file", risk: "risk", cx: "cx", churn: "churn", loc: "loc", commits: "commits" },
    callout: (path, score, cx, churn, commits) =>
      `Top risk is <b>${path}</b> at ${score} — complexity ${cx}, churn ${churn} over ${commits} commits.`,
    notAlarming: "Nothing crosses the hotspot threshold of 60, so this ranking is relative, not alarming.",
    axisChurn: "churn — lines changed →",
    axisComplexity: "complexity ↑",
  },
  history: {
    title: "Change history",
    subtitle: (churn) => `${churn} lines churned`,
    lede: '<b>What this is:</b> where git activity concentrates, by module and by file. <b>How to read it:</b> churn shows which parts of the repo are alive; pair it with risk — high churn in a simple module is healthy iteration, high churn in a complex one is debt accumulating. The recent list answers "what has the team been doing".',
    churnByModule: "Churn by module",
    mostChanged: "Most-changed files",
    recentlyModified: "Recently modified",
    col: { file: "file", churn: "churn", commits: "commits", module: "module", modified: "modified", contributors: "contributors" },
    callout: (module, maxContrib, plural) =>
      `<b>${module}</b> absorbs the most churn. Files carry at most ${maxContrib} contributor${plural ? "s" : ""}, so bus factor — not merge conflict — is the people risk here.`,
  },
  symbols: {
    title: "Symbols",
    subtitle: (n) => `${n} parsed`,
    lede: "<b>What this is:</b> the classes, interfaces, functions and methods found inside the source files. <b>How to read it:</b> the mix describes the codebase's style — interface-heavy means a typed contract layer, function-heavy a procedural pipeline. The complexity table is what to check before touching anything: those symbols are hardest to change safely.",
    byKind: "Symbols by kind",
    filesWithMost: "Files with most symbols",
    mostComplex: "Most complex symbols",
    col: { symbol: "symbol", kind: "kind", file: "file", cx: "cx", loc: "loc" },
    callout: (name, file, cx, loc) =>
      `<b>${name}</b> in ${file} is the most complex symbol (complexity ${cx}, ${loc} lines) — first candidate to break up if that file needs work.`,
  },
  reading: {
    title: "Where to start reading",
    lede: "A path through the code for someone opening this repository for the first time, ordered by how much structure each file explains.",
  },
  footer: {
    schema: "schema",
    analyzer: "analyzer",
    config: "config",
  },
  tip: {
    loc: "loc",
    risk: "risk",
    fanIn: "fan-in",
    fanOut: "fan-out",
    in: "in",
    out: "out",
    files: "files",
    imports: "imports",
    partOfCycle: "part of a cycle",
    churn: "churn",
    cx: "cx",
  },
  empty: {
    repoMapUnavailable: "Repo map unavailable — could not build a file hierarchy for this analysis.",
    noConnectedGraph: "No connected files to graph.",
    noConnectedMatrix: "No connected files to show in the matrix.",
    noMatrixMatch: "No files match the selected row/column modules.",
    noHotspotData: "No files with churn or complexity data to plot.",
  },
};

const es: Dict = {
  htmlLang: "es",
  eyebrow: "Informe de arquitectura del repositorio",
  titleSuffix: "Informe del repositorio",
  dirtyWorktree: "árbol de trabajo con cambios",
  cleanWorktree: "árbol de trabajo limpio",
  generated: "generado",
  utc: "UTC",
  analyzer: "analizador",
  langToggleLabel: "Idioma",

  snapshot: {
    title: "Resumen general",
    lede: "Ocho cifras que sitúan al repositorio: cuánto código hay, cuánto pudo leer el parser y qué tan enredado está. Úsalo como referencia para la próxima ejecución — un aumento en los ciclos o las violaciones es la señal que vale la pena atender.",
    files: "archivos",
    loc: "líneas de código",
    sourceFiles: "archivos fuente",
    symbols: "símbolos",
    importEdges: "relaciones de importación",
    cycles: "ciclos",
    violations: "violaciones",
    parsed: "analizados",
    callout: (testPct, testCount, fileCount, skipped, failed) =>
      `${testPct} de los archivos son pruebas (${testCount} de ${fileCount}). El parser omitió ${skipped} archivos — configuración, documentación y salida generada, no código fuente — y falló en ${failed}.`,
  },
  summary: {
    title: "Resumen ejecutivo",
    lede: "Una lectura escrita de esta ejecución, generada junto con las métricas. Todo lo que sigue es la evidencia detrás de ella.",
    keyInsights: "Hallazgos clave",
  },
  composition: {
    title: "Composición",
    subtitle: (modules, types) => `${modules} módulos · ${types} tipos de archivo`,
    lede: "<b>Qué es esto:</b> dónde viven realmente las líneas — por categoría (código, documentación, recursos), por módulo (primeros dos segmentos de la ruta) y por tipo de archivo. <b>Cómo leerlo:</b> la división por categoría muestra cuánto del repositorio es código fuente que realmente leerías como tal; la barra superior es donde irá la mayor parte de tu tiempo de lectura; un módulo con muchos archivos pero pocas líneas suele ser configuración o fixtures, y un tipo de archivo inesperado vale la pena revisarlo.",
    locByCategory: "Líneas de código por categoría",
    categoryAll: "Todo",
    categoryCode: "Código",
    categoryDocs: "Documentación",
    categoryAssets: "Recursos",
    filterHint: "Filtra el desglose por módulo y por tipo de archivo de abajo a una sola categoría.",
    locByModule: "Líneas de código por módulo",
    locByFileType: "Líneas de código por tipo de archivo",
    filesSuffix: "archivos",
    noFilesInCategory: "No hay archivos en esta categoría.",
    categoryCallout: (codePct, docsPct, assetsPct) =>
      `${codePct} de este repositorio es código real, ${docsPct} es documentación y ${assetsPct} son recursos y otros archivos que no son código.`,
    callout: (topModule, pct, loc, files, top3Pct, depth) =>
      `<b>${topModule}</b> contiene ${pct} de todo el código (${loc} líneas en ${files} archivos); los tres módulos principales suman ${top3Pct} del repositorio. Los directorios anidan ${depth} niveles de profundidad.`,
  },
  map: {
    title: "Mapa del repositorio",
    subtitle: "mapa de árbol, área = líneas de código",
    lede: "<b>Qué es esto:</b> cada archivo como un rectángulo anidado dentro de su carpeta, con área proporcional a las líneas de código. <b>Cómo leerlo:</b> busca los pocos rectángulos grandes — dominan el código base y son donde una refactorización rinde más; una carpeta que es un rectángulo gigante con migajas alrededor suele necesitar dividirse. Pasa el cursor para ver métricas.",
    callout: (path, loc, pct) => `Archivo individual más grande: <b>${path}</b> con ${loc} líneas — ${pct} del repositorio por sí solo.`,
  },
  graph: {
    title: "Grafo de dependencias",
    subtitle: (edges) => `${edges} relaciones de importación`,
    lede: "<b>Qué es esto:</b> cada archivo fuente conectado es un círculo (área = líneas de código, color = módulo), cada flecha una importación. Los archivos sin importaciones en ningún sentido se omiten para que la forma siga siendo legible. <b>Cómo leerlo:</b> los círculos hacia los que todo apunta son cimientos compartidos — cámbialos con cuidado; los círculos con muchas flechas salientes son orquestadores y el lugar natural para empezar a leer. Haz clic en un nodo para aislar su vecindario — haz clic de nuevo, o en un espacio vacío, para limpiar. Arrastra para desplazarte; mantén Ctrl (Windows/Linux) o Cmd (Mac) y usa la rueda para hacer zoom, así el scroll de la página sigue funcionando sobre el gráfico. Los contornos rojos marcan archivos en un ciclo de importación.",
    callout: (connected, total, orphans, examples) =>
      `${connected} de ${total} archivos fuente participan en el grafo de importaciones; ${orphans} no importan nada ni son importados por nadie${
        examples ? ` (p. ej. ${examples})` : ""
      } — normalmente puntos de entrada, scripts o código muerto que vale la pena revisar.`,
    legendCycle: "en un ciclo",
    hint: "clic en un nodo para aislar su vecindario · ⌃ Ctrl / ⌘ Cmd + scroll para zoom · arrastra para desplazar",
  },
  coupling: {
    title: "Acoplamiento y ciclos",
    subtitle: (n) => `${n} ciclo${n === 1 ? "" : "s"}`,
    lede: "<b>Qué es esto:</b> las mismas importaciones como una matriz — una marca en fila → columna significa que el archivo de la fila importa al de la columna. <b>Cómo leerlo:</b> una columna densa es un eje del que todo depende; una fila densa es un archivo que depende de todo. Las marcas reflejadas a ambos lados de la diagonal para un mismo par son un ciclo (rojo) y deberían romperse. Las tablas ordenan lo que la matriz señala. Haz clic en una fila o columna para rastrear todo lo que toca, o en una celda para aislar esa intersección — haz clic de nuevo, o en el fondo vacío, para limpiar.",
    rows: "Filas",
    cols: "Columnas",
    allModules: "Todos los módulos",
    caption: "Ordenado por ruta, así las carpetas aparecen en bloques. Filtra filas/columnas por módulo, haz clic en una etiqueta o celda para resaltar, pasa el cursor por una celda para ver el par.",
    fanInHeading: "Más dependido · fan-in",
    fanOutHeading: "Depende más de otros · fan-out",
    cyclesHeading: "Ciclos",
    noCycles: "No se detectaron ciclos de importación.",
    col: { file: "archivo", module: "módulo", in: "in", out: "out", instab: "inestab." },
    callout: (hubPath, hubIn, hubPct, spokePath, spokeOut) =>
      `El mayor fan-in es <b>${hubPath}</b> con ${hubIn} dependientes — un cambio ahí afecta a ${hubPct} del grafo conectado. El mayor fan-out es <b>${spokePath}</b> con ${spokeOut} dependencias: el punto de orquestación.`,
  },
  hidden: {
    title: "Acoplamiento oculto",
    subtitle: (n) => `${n} par${n === 1 ? "" : "es"}`,
    lede: "<b>Qué es esto:</b> pares de archivos que se han modificado juntos repetidamente sin tener ninguna importación entre ellos — un acoplamiento que git puede ver pero el compilador no. <b>Cómo leerlo:</b> los pares de alta confianza son candidatos a una abstracción compartida o una responsabilidad mal ubicada, y son los más propensos a romperse mutuamente durante una refactorización.",
    col: { fileA: "archivo a", fileB: "archivo b", commitsTogether: "commits juntos", confidence: "confianza" },
    callout: (a, b, weight, confidence) =>
      `Par más fuerte: <b>${a}</b> y <b>${b}</b> — cambiaron juntos ${weight} veces con ${confidence} de confianza sin ninguna importación entre ellos.`,
    none: "Todo par que cambia junto también tiene una importación — no se detectó acoplamiento oculto.",
  },
  risk: {
    title: "Riesgo y puntos calientes",
    subtitle: (n) => `${n} archivos evaluados`,
    lede: "<b>Qué es esto:</b> churn (líneas cambiadas a lo largo del historial de git) frente a complejidad; área de la burbuja = tamaño del archivo, color = puntaje de riesgo. <b>Cómo leerlo:</b> el cuadrante superior derecho es la zona de peligro — código complejo que además cambia constantemente, el objetivo clásico de refactorización. Abajo a la derecha es churny pero simple (saludable). Arriba a la izquierda es complejo pero estable (no lo toques a menos que sea necesario).",
    caption: "Se grafica cada archivo con historial de git; los seis archivos de mayor riesgo están etiquetados.",
    heading: "Archivos de mayor riesgo",
    col: { file: "archivo", risk: "riesgo", cx: "cx", churn: "churn", loc: "loc", commits: "commits" },
    callout: (path, score, cx, churn, commits) =>
      `El mayor riesgo es <b>${path}</b> con ${score} — complejidad ${cx}, churn ${churn} en ${commits} commits.`,
    notAlarming: "Nada cruza el umbral de punto caliente de 60, así que este ranking es relativo, no alarmante.",
    axisChurn: "churn — líneas cambiadas →",
    axisComplexity: "complejidad ↑",
  },
  history: {
    title: "Historial de cambios",
    subtitle: (churn) => `${churn} líneas modificadas`,
    lede: '<b>Qué es esto:</b> dónde se concentra la actividad de git, por módulo y por archivo. <b>Cómo leerlo:</b> el churn muestra qué partes del repositorio están vivas; combínalo con el riesgo — mucho churn en un módulo simple es iteración saludable, mucho churn en uno complejo es deuda acumulándose. La lista reciente responde "en qué ha estado trabajando el equipo".',
    churnByModule: "Churn por módulo",
    mostChanged: "Archivos más cambiados",
    recentlyModified: "Modificados recientemente",
    col: { file: "archivo", churn: "churn", commits: "commits", module: "módulo", modified: "modificado", contributors: "colaboradores" },
    callout: (module, maxContrib, plural) =>
      `<b>${module}</b> absorbe la mayor parte del churn. Los archivos tienen como máximo ${maxContrib} colaborador${plural ? "es" : ""}, así que el factor bus — no los conflictos de merge — es el riesgo humano aquí.`,
  },
  symbols: {
    title: "Símbolos",
    subtitle: (n) => `${n} analizados`,
    lede: "<b>Qué es esto:</b> las clases, interfaces, funciones y métodos encontrados dentro de los archivos fuente. <b>Cómo leerlo:</b> la mezcla describe el estilo del código base — mucho uso de interfaces implica una capa de contratos tipados, mucho uso de funciones implica un pipeline procedural. La tabla de complejidad es lo que hay que revisar antes de tocar nada: esos símbolos son los más difíciles de cambiar con seguridad.",
    byKind: "Símbolos por tipo",
    filesWithMost: "Archivos con más símbolos",
    mostComplex: "Símbolos más complejos",
    col: { symbol: "símbolo", kind: "tipo", file: "archivo", cx: "cx", loc: "loc" },
    callout: (name, file, cx, loc) =>
      `<b>${name}</b> en ${file} es el símbolo más complejo (complejidad ${cx}, ${loc} líneas) — primer candidato a dividir si hay que trabajar en ese archivo.`,
  },
  reading: {
    title: "Por dónde empezar a leer",
    lede: "Un recorrido por el código para alguien que abre este repositorio por primera vez, ordenado por cuánta estructura explica cada archivo.",
  },
  footer: {
    schema: "esquema",
    analyzer: "analizador",
    config: "config",
  },
  tip: {
    loc: "loc",
    risk: "riesgo",
    fanIn: "fan-in",
    fanOut: "fan-out",
    in: "in",
    out: "out",
    files: "archivos",
    imports: "importa a",
    partOfCycle: "parte de un ciclo",
    churn: "churn",
    cx: "cx",
  },
  empty: {
    repoMapUnavailable: "Mapa del repositorio no disponible — no se pudo construir una jerarquía de archivos para este análisis.",
    noConnectedGraph: "No hay archivos conectados para graficar.",
    noConnectedMatrix: "No hay archivos conectados para mostrar en la matriz.",
    noMatrixMatch: "Ningún archivo coincide con los módulos de fila/columna seleccionados.",
    noHotspotData: "No hay archivos con datos de churn o complejidad para graficar.",
  },
};

export const DICT: Record<Lang, Dict> = { en, es };

export function t(lang: Lang): Dict {
  return DICT[lang];
}
