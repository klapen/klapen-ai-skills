export interface BarRow {
  label: string;
  value: number;
  color?: string;
  text?: string;
}

/** `label` must already be escaped by the caller — this module never escapes, it only assembles. */
export function barRows(rows: BarRow[], max: number): string {
  return rows
    .map(
      (r) =>
        `<div class="bar-row"><div class="lab"><span class="nm" title="${r.label}">${r.label}</span>` +
        `<span class="tr"><span class="fl" style="width:${Math.max(1, (r.value / max) * 100)}%;background:${
          r.color ?? "var(--accent)"
        }"></span></span></div><span class="v">${r.text ?? r.value.toLocaleString()}</span></div>`
    )
    .join("");
}

export interface TableColumn {
  header: string;
  numeric?: boolean;
  cls?: string;
}

/** Cell values must already be escaped by the caller where they carry untrusted text. */
export function tableHTML(cols: TableColumn[], rows: Array<Array<string | number>>): string {
  const head = cols.map((c) => `<th class="${c.numeric ? "n" : ""}">${c.header}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td class="${cols[i].numeric ? "n" : ""}${cols[i].cls ? ` ${cols[i].cls}` : ""}">${cell}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export interface ReportSection {
  id: string;
  title: string;
}

/** `title`/`lede`/`body` are trusted static editorial copy or already-escaped dynamic content. */
export function section(
  sections: ReportSection[],
  id: string,
  title: string,
  count: string | number | null,
  lede: string,
  body: string
): string {
  sections.push({ id, title });
  return `<section id="${id}"><h2>${title}${count !== null ? `<em>${count}</em>` : ""}</h2><p class="lede">${lede}</p>${body}</section>`;
}

export function callout(text: string, variant?: "bad"): string {
  return `<p class="callout ${variant ?? ""}">${text}</p>`;
}
