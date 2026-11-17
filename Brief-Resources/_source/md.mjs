// A small Markdown reader for these documents. It understands what the documents use and nothing more:
// numbered headings (## and ###), paragraphs, bullet and numbered lists, tables, code blocks, notes (>), figures and bold, italic and code.
// It escapes everything it does not recognise, so a stray symbol can never become markup.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function inline(text) {
  let out = esc(text);
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  return out;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Turns a document into { meta, html, toc }. Figures are written as ![Caption](file.png) and resolved by `figure(file)`. */
export function render(source, { figure }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const meta = {};
  let i = 0;
  while (i < lines.length && lines[i].trim() !== "---") {
    const m = /^(\w+):\s*(.*)$/.exec(lines[i]);
    if (m) meta[m[1]] = m[2];
    i++;
  }
  i++;

  const toc = [];
  let h2 = 0;
  let h3 = 0;
  const out = [];
  const flushPara = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { flushPara(para); i++; continue; }

    if (/^<pagebreak>/.test(line)) { flushPara(para); out.push('<div class="pagebreak"></div>'); i++; continue; }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara(para);
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level === 2) { h2++; h3 = 0; const id = slug(`${h2}-${title}`); toc.push({ level: 2, number: `${h2}`, title, id }); out.push(`<h2 id="${id}"><span class="num">${h2}</span>${esc(title)}</h2>`); }
      else if (level === 3) { h3++; const n = `${h2}.${h3}`; const id = slug(`${n}-${title}`); toc.push({ level: 3, number: n, title, id }); out.push(`<h3 id="${id}"><span class="num">${n}</span>${esc(title)}</h3>`); }
      else out.push(`<h4>${esc(title)}</h4>`);
      i++; continue;
    }

    if (/^```/.test(line)) {
      flushPara(para);
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre>${esc(code.join("\n"))}</pre>`);
      continue;
    }

    const image = /^!\[(.*)\]\((.*)\)\s*$/.exec(line);
    if (image) { flushPara(para); out.push(figure(image[2], image[1])); i++; continue; }

    if (/^>\s?/.test(line)) {
      flushPara(para);
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<div class="note">${inline(quote.join(" "))}</div>`);
      continue;
    }

    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara(para);
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const headless = head.every((c) => c === "");
      out.push(
        `<table>${headless ? "" : `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`}<tbody>${rows
          .map((r) => `<tr>${r.map((c, k) => `<td${headless && k === 0 ? ' class="label"' : ""}>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }

    const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (listItem) {
      flushPara(para);
      const ordered = /\d/.test(listItem[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && m[1].length === 0) { items.push({ text: [m[3]], sub: [] }); i++; }
        else if (m && m[1].length > 0 && items.length) { items[items.length - 1].sub.push(m[3]); i++; }
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text.push(lines[i].trim()); i++; }
        else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text.join(" "))}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return { meta, html: out.join("\n"), toc };
}
